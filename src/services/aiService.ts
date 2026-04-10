import { GoogleGenAI } from "@google/genai";
import { ExtractionResult, MaintenanceRecord, ChatMessage, MarketPrice } from "../types";
import { arePlatesSimilar, normalizePlate } from "../lib/utils";

// Initialize AI directly in the frontend
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function isApiKeyAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

function getAIErrorMessage(err: any): string {
  if (!err) return "AI operation failed";
  const message = err.message || String(err);
  const errString = String(err);
  
  const isNetworkError = 
    message.includes("Failed to fetch") || 
    message.includes("NetworkError") ||
    errString.includes("Failed to fetch") ||
    errString.includes("TypeError: Load failed");

  if (isNetworkError) {
    return "AI connection error. Please check your internet connection or verify your API key configuration.";
  }
  
  if (message.includes("API key not valid")) {
    return "Invalid Gemini API key. Please check your configuration in AI Studio.";
  }

  if (message.includes("429") || message.includes("quota") || message.includes("limit") || message.includes("RESOURCE_EXHAUSTED")) {
    return "AI daily quota exceeded. Google limits free usage; this will reset at midnight. Please try again later or use a different API key.";
  }

  return message;
}

export async function extractMaintenanceData(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  const systemInstruction = `You are an expert at reading maintenance logs for trucks (both hand-written and digital). 
              
              Task: Extract EVERY SINGLE maintenance entry and mechanical detail from the provided image.
              
              Context:
              - The image could be a photo of a notebook, a digital log, or a screenshot.
              - Look for dates, truck plate numbers, and descriptions of mechanical work or parts.
              - Fleet Knowledge:
                * MB Axor MP3: KCL 054 to KCY 901B, and UAY 469L.
                * MB Actros MP4: KCZ 945Y to KDS 849R.
              
              Data Structure:
              - Plate Number: Identify the truck's main plate number. 
                * IMPORTANT: Ignore any trailer numbers. A trailer number usually appears after a "/" or a "-". 
                * Example: "Kcw 822 b/Zg 1361" -> Extract only "Kcw 822 b".
                * Example: "Kcn 851 s /zf 7827 (Gadano)" -> Extract only "Kcn 851 s".
                * Example: "Kdm 703 f - beko" -> Extract only "Kdm 703 f".
                * Clean the plate number: remove extra spaces and ensure it's the primary truck ID.
              - Date: The date the work was done. Convert to YYYY-MM-DD format. 
                * IMPORTANT: Ensure the date is a VALID calendar date. (e.g., April has only 30 days; if the log says 31/04, use 30/04).
                * If the date is missing or marked as "—", use the current date: ${new Date().toISOString().split('T')[0]}.
              - Service Description: What was fixed or replaced. 
                * **CRITICAL**: You MUST extract EVERY SINGLE item listed in the log. Do NOT summarize. Do NOT skip any entries.
                * If there is a list (e.g., i, ii, iii or 1, 2, 3), extract EVERY numbered item.
                * Include the general log description, specific spare parts, and any metadata like "Garage", "Supervisor", or "Fundi" (mechanic).
                * **COST EXTRACTION**: If you see any prices, amounts, or currency (e.g., "5000", "KES 10,000", "50 USD"), extract them clearly. 
                * Format the description to include costs like this: "[Part/Service Name] - [Amount] [Currency]".
              
              Important:
              - GROUPING: If multiple maintenance items are found on the same page for the SAME TRUCK and SAME DATE, you MUST combine them into a SINGLE record. 
              - Use a newline or a comma to separate items within the service_description.
              - Only create separate records if the truck plate number or the date changes.
              - Combine all related information (Maintenance log, Spare parts, Garage, Supervisor, Fundi) into a single detailed Service Description, but ENSURE NO ITEMS ARE OMITTED.
              - If you are absolutely sure there are no maintenance records, return an empty array.
              
              Return the data in a structured JSON format with a "records" array containing objects with plate_number, service_date, service_description, and confidence.`;

  try {
    console.log("[AI] Starting extraction with Gemini...");
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: systemInstruction },
          {
            inlineData: {
              data: base64Data,
              mimeType,
            },
          },
        ]
      },
    });

    const text = result.text;
    console.log("[AI] Extraction raw response:", text);

    // Clean markdown if present
    const jsonMatch = text?.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : text;
    return JSON.parse(cleanJson || '{"records":[]}');
  } catch (e: any) {
    console.error("[AI] AI Extraction Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

export async function analyzeMaintenanceData(
  query: string, 
  records: MaintenanceRecord[], 
  chatHistory: ChatMessage[] = [],
  marketPrices: MarketPrice[] = []
): Promise<string> {
  
  // Smart Filtering: If the query mentions a specific truck, filter the records first
  // This improves accuracy and reduces noise for the AI
  let filteredRecords = [...records];
  let filterNote = "";

  // Simple heuristic: look for words that look like plates (3+ chars, often alphanumeric)
  const words = query.split(/[\s,]+/).filter(w => w.length >= 3);
  let detectedPlate = "";

  for (const word of words) {
    const normalizedWord = normalizePlate(word);
    // Check if this word matches any plate in our database
    const match = records.find(r => arePlatesSimilar(r.plate_number, normalizedWord));
    if (match) {
      detectedPlate = match.plate_number;
      filteredRecords = records.filter(r => arePlatesSimilar(r.plate_number, detectedPlate));
      filterNote = `\n**NOTE**: I have pre-filtered the data to only include records for truck ${detectedPlate} as it was mentioned in the query.`;
      break;
    }
  }

  // Format records for the AI
  const formattedRecords = filteredRecords.map(r => ({
    plate: r.plate_number,
    date: r.service_date,
    desc: r.service_description
  }));

  // Format market prices for the AI
  const formattedMarketPrices = marketPrices.map(p => ({
    item: p.item_name,
    price: `${p.currency} ${p.price}`,
    confirmed_by: p.confirmed_by,
    date: p.last_updated
  }));

  // Pre-calculate truck summary for precision (on the filtered set)
  const truckSummary: Record<string, { count: number, originalPlates: string[] }> = {};
  filteredRecords.forEach(r => {
    const norm = normalizePlate(r.plate_number);
    let found = false;
    for (const key in truckSummary) {
      if (arePlatesSimilar(key, norm)) {
        truckSummary[key].count++;
        if (!truckSummary[key].originalPlates.includes(r.plate_number)) {
          truckSummary[key].originalPlates.push(r.plate_number);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      truckSummary[norm] = { count: 1, originalPlates: [r.plate_number] };
    }
  });

  const systemInstruction = `You are an expert fleet maintenance analyst and master mechanic for DT.Base. 
  You specialize in Mercedes-Benz trucks, specifically the **MB Axor MP3** and **MB Actros MP4**.
  
  Your task is to answer questions, summarize, analyze, and provide mechanical advice based on maintenance data.
  
  **CRITICAL**: Be extremely CONCISE. Provide short, direct answers. Avoid long explanations unless specifically asked. Use bullet points for lists.
  
  **Market Knowledge (Confirmed Prices)**:
  These are prices that have been confirmed or corrected by the user. ALWAYS prioritize these over internet search results.
  ${JSON.stringify(formattedMarketPrices, null, 2)}

  **Truck Summary (PRE-CALCULATED COUNTS)**:
  Use these counts for accuracy when asked "how many records" or "how many times". 
  ${Object.entries(truckSummary).map(([key, data]) => `- ${data.originalPlates[0]} (and similar: ${data.originalPlates.join(', ')}): ${data.count} records`).join('\n')}
  ${filterNote}

  **Price Corrections**:
  If the user provides a price correction (e.g., "no KES 22,000" or "the price is actually 5000"), acknowledge it. 
  IMPORTANT: If you detect a price correction, start your response with the tag [PRICE_CORRECTION: Item Name | Price | Currency]. 
  Example: [PRICE_CORRECTION: Caltex Ultra E | 22000 | KES]
  This allows the system to save the correction to the database.

  Fleet Knowledge (Identify models based on Plate Numbers):
  - **MB Axor MP3**: 
    * Range: KCL 054 to KCY 901B (Alphabetical order)
    * Specific: UAY 469L
  - **MB Actros MP4**: 
    * Range: KCZ 945Y to KDS 849R (Alphabetical order)
  
  Differentiating Query Types:
  - **Single Truck**: If the user starts their query with a plate number (e.g., "Kcw 822 b..."), focus your analysis ONLY on that specific truck. Identify if it is an Axor MP3 or Actros MP4.
  - **Maintenance Analysis**: If the user starts their query with a maintenance type (e.g., "oil change...", "tires...", "service..."), analyze that specific type of maintenance across all trucks.
  - **Overall Quotations**: If the user uses the word "overall" in their query, provide a summary or analysis of the entire database.
  
  Cost Analysis & Pricing:
  - **Extract Costs**: Look for currency symbols or keywords like "KES", "USD", "Price", "Cost", "Amount" within the service descriptions.
  - **Calculate Totals**: If asked for costs, sum up the values you find. Be careful with different currencies (default to KES if not specified, but note if multiple are present).
  
  Mechanic Persona:
  - Act as a highly skilled mechanic. If you see recurring issues (e.g., frequent brake changes on an Actros MP4), provide technical insights or preventative maintenance suggestions specific to that model.
  - Use your knowledge of MB Axor MP3 and Actros MP4 specifications (engines, common wear items, service intervals) to enhance your answers.
  
  Context:
  - You have access to a list of maintenance records.
  - Plate numbers follow a specific similarity rule: if more than 5 characters match at the same positions, they are the same truck.
  - Trailer numbers (after / or -) are ignored.
  
  Instructions:
  - Be concise, professional, and technically accurate.
  - Present lists and summaries in **Alphabetical order** by plate number unless requested otherwise.
  - If asked to summarize, group by truck or by type of work.
  - If asked to analyze, look for patterns (e.g., recurring issues with a specific truck).
  - If asked to organize, provide a structured list or table-like format in markdown.
  - If the data doesn't contain the answer, say so clearly.
  
  Current Data:
  ${JSON.stringify(formattedRecords, null, 2)}
  `;

  try {
    console.log("[AI] Starting chat analysis with Gemini...");
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      history: chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })),
      config: {
        systemInstruction: systemInstruction
      }
    });

    const result = await chat.sendMessage({ message: query });
    return result.text || "I couldn't generate a response.";
  } catch (e: any) {
    console.error("[AI] AI Analysis Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

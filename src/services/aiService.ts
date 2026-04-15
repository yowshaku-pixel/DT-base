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
    message.includes("Load failed") ||
    message.includes("connection error") ||
    errString.includes("Failed to fetch") ||
    errString.includes("TypeError: Load failed") ||
    errString.includes("NetworkError");

  if (isNetworkError) {
    return "AI connection error. This usually happens due to unstable internet or API rate limits. Please check your connection and try again.";
  }
  
  if (message.includes("API key not valid")) {
    return "Invalid Gemini API key. Please check your configuration in AI Studio.";
  }

  if (message.includes("404") || message.includes("NOT_FOUND")) {
    return "AI model not found. This might be a temporary issue with the Gemini service or an incorrect model configuration. Please try again in a few minutes.";
  }

  const isDailyQuota = message.includes("billing details") || message.includes("plan") || message.includes("quota exceeded");
  const isRateLimit = message.includes("429") || message.includes("quota") || message.includes("limit") || message.includes("RESOURCE_EXHAUSTED");

  if (isDailyQuota) {
    return "AI daily quota exceeded. Google limits free usage; this will reset at midnight. Please try again later or use a different API key.";
  }

  if (isRateLimit) {
    return "AI rate limit hit. Too many requests in a short time. The system will automatically retry in a few seconds.";
  }

  return message;
}

export async function extractMaintenanceData(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  const systemInstruction = `Expert truck maintenance log extractor (hand-written/digital).
              
              Task: Extract EVERY entry. Do NOT summarize or skip.
              
              Fleet:
              - MB Axor MP3: KCL 054 to KCY 901B, UAY 469L.
              - MB Actros MP4: KCZ 945Y to KDS 849R.
              
              Rules:
              - Plate: Primary truck ID only. Ignore trailer numbers (after / or -). Clean spaces.
              - Date: YYYY-MM-DD. If invalid/missing, use current: ${new Date().toISOString().split('T')[0]}.
              - Description: Extract ALL items, numbered lists, parts, and costs (e.g., "[Part] - [Amount] [Currency]").
              - Grouping: Combine items for SAME truck and SAME date into one record.
              
              Output: JSON { "records": [{ "plate_number", "service_date", "service_description", "confidence" }] }`;

  try {
    console.log("[AI] Starting extraction with Gemini...");
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: systemInstruction },
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
          ]
        }
      ],
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

  // Format records for the AI (Deduplicated)
  const seenRecords = new Set<string>();
  const formattedRecords = [];

  for (const r of filteredRecords) {
    const key = `${normalizePlate(r.plate_number)}|${r.service_date}|${r.service_description.toLowerCase().trim()}`;
    if (seenRecords.has(key)) continue;
    seenRecords.add(key);
    
    formattedRecords.push({
      plate: r.plate_number,
      date: r.service_date,
      desc: r.service_description
    });
  }

  // Format market prices for the AI
  const formattedMarketPrices = marketPrices.map(p => ({
    item: p.item_name,
    price: `${p.currency} ${p.price}`,
    confirmed_by: p.confirmed_by,
    date: p.last_updated
  }));

  // Pre-calculate truck summary for precision (on the filtered set, Deduplicated)
  const truckSummary: Record<string, { count: number, originalPlates: string[] }> = {};
  const seenSummaryRecords = new Set<string>();

  filteredRecords.forEach(r => {
    const norm = normalizePlate(r.plate_number);
    const key = `${norm}|${r.service_date}|${r.service_description.toLowerCase().trim()}`;
    
    if (seenSummaryRecords.has(key)) return;
    seenSummaryRecords.add(key);

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

  const systemInstruction = `You are Anni, an expert fleet maintenance analyst and master mechanic for DT.Base. 
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
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        {
          role: "user",
          parts: [{ text: systemInstruction + "\n\nUser Query: " + query }]
        }
      ],
      config: {
        maxOutputTokens: 1000,
      }
    });

    return result.text || "I couldn't generate a response.";
  } catch (e: any) {
    console.error("[AI] AI Analysis Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult, MaintenanceRecord, ChatMessage, MarketPrice } from "../types";
import { arePlatesSimilar, normalizePlate } from "../lib/utils";

// Use the API key from environment variables (Vite or process.env)
const getApiKey = () => {
  // In AI Studio Build, the key is usually available as process.env.GEMINI_API_KEY
  // but for client-side apps, Vite doesn't automatically expose process.env.
  // We check both Vite's import.meta.env and a global process.env if it exists.
  
  const viteKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
  const processKey = typeof process !== 'undefined' ? (process.env.API_KEY || process.env.GEMINI_API_KEY) : '';
  
  console.log("[DEBUG] getApiKey: viteKey exists:", !!viteKey);
  console.log("[DEBUG] getApiKey: processKey exists:", !!processKey);
  
  const key = viteKey || processKey;
  return key && key !== 'MY_GEMINI_API_KEY' ? key : null;
};

export type KeySource = 'free' | 'selected' | 'custom' | 'none';

export function getKeySource(): KeySource {
  const viteKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
  if (viteKey && viteKey !== 'MY_GEMINI_API_KEY') return 'custom';
  
  if (typeof process !== 'undefined') {
    if (process.env.API_KEY) return 'selected';
    if (process.env.GEMINI_API_KEY) return 'free';
  }
  
  return 'none';
}

export function isApiKeyAvailable(): boolean {
  return !!getApiKey();
}

export async function extractMaintenanceData(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please go to the 'Settings' menu (gear icon), then 'Secrets', and add a secret named 'VITE_GEMINI_API_KEY' with your Gemini API key.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  console.log("Starting AI extraction with model: gemini-3-flash-preview");
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `You are an expert at reading maintenance logs for trucks (both hand-written and digital). 
              
              Task: Extract all maintenance entries from the provided image.
              
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
              - Service Description: What was fixed or replaced. Include the general log description, specific spare parts, and any metadata like "Garage", "Supervisor", or "Fundi" (mechanic).
                * **COST EXTRACTION**: If you see any prices, amounts, or currency (e.g., "5000", "KES 10,000", "50 USD"), extract them clearly. 
                * Format the description to include costs like this: "[Part/Service Name] - [Amount] [Currency]".
              
              Important:
              - If multiple distinct entries are found in one image, create a separate record for each.
              - Combine all related information (Maintenance log, Spare parts, Garage, Supervisor, Fundi) into a single detailed Service Description.
              - If you are absolutely sure there are no maintenance records, return an empty array.
              
              Return the data in a structured JSON format.`,
            },
            {
              inlineData: {
                data: base64Data,
                mimeType,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            records: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  plate_number: { type: Type.STRING, description: "The truck's plate number" },
                  service_date: { type: Type.STRING, description: "The date of service" },
                  service_description: { type: Type.STRING, description: "Description of the work done" },
                  confidence: { type: Type.NUMBER, description: "Confidence score from 0 to 1" },
                },
                required: ["plate_number", "service_date", "service_description"],
              },
            },
          },
          required: ["records"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') {
        throw new Error("AI blocked the image due to safety filters. Please ensure the photo only contains log text.");
      }
      throw new Error(`No response from AI (Reason: ${finishReason || 'Unknown'})`);
    }
    
    try {
      return JSON.parse(text);
    } catch (parseError) {
      console.error("JSON Parse Error. Raw text:", text);
      throw new Error("AI returned an invalid data format. Please try again.");
    }
  } catch (e: any) {
    console.error("AI Extraction Error:", e);
    
    // Extract error message from various possible formats
    let rawError = e.message || "";
    let errorMessage = rawError;
    
    // Try to parse if it's a JSON string (common in Gemini SDK errors)
    try {
      if (rawError.startsWith('{')) {
        const parsed = JSON.parse(rawError);
        errorMessage = parsed.error?.message || parsed.message || rawError;
      }
    } catch (p) {
      // Not JSON, use as is
    }

    let isRateLimit = false;
    let isHardQuota = false;
    
    const lowerMsg = errorMessage.toLowerCase();
    
    // Check for hard quota limits (daily or plan-based)
    if (lowerMsg.includes("billing details") || 
        lowerMsg.includes("current quota") || 
        lowerMsg.includes("plan") || 
        lowerMsg.includes("daily limit reached")) {
      isHardQuota = true;
    }
    
    // Check for transient rate limits
    if (lowerMsg.includes("429") || 
        lowerMsg.includes("resource_exhausted") || 
        lowerMsg.includes("rate limit") || 
        lowerMsg.includes("quota_exceeded")) {
      isRateLimit = true;
    }

    if (isHardQuota) {
      throw new Error(`AI_DAILY_QUOTA_EXCEEDED: ${errorMessage}`);
    }

    if (isRateLimit) {
      throw new Error(`AI_RATE_LIMIT_EXCEEDED: ${errorMessage}`);
    }
    
    if (errorMessage.includes("API_KEY_INVALID")) {
      throw new Error("Invalid API Key: Please check your Gemini API Key in the 'Secrets' tab.");
    }
    
    const isNetworkError = errorMessage.toLowerCase().includes("failed to fetch") || 
                           errorMessage.toLowerCase().includes("xhr error") || 
                           errorMessage.toLowerCase().includes("rpc failed") ||
                           errorMessage.includes("500") ||
                           errorMessage.toLowerCase().includes("internal error");

    if (isNetworkError) {
      throw new Error(`AI Network/Server Error: ${e.message || "Failed to connect to AI service. Please check your internet connection."}`);
    }
    
    throw new Error(e.message || "AI Extraction Failed");
  }
}

export async function analyzeMaintenanceData(
  query: string, 
  records: MaintenanceRecord[], 
  chatHistory: ChatMessage[] = [],
  marketPrices: MarketPrice[] = []
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
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

  // Format market prices for the AI
  const formattedMarketPrices = marketPrices.map(p => ({
    item: p.item_name,
    price: `${p.currency} ${p.price}`,
    confirmed_by: p.confirmed_by,
    date: p.last_updated
  }));

  const systemInstruction = `You are an expert fleet maintenance analyst and master mechanic for DT.Base. 
  You specialize in Mercedes-Benz trucks, specifically the **MB Axor MP3** and **MB Actros MP4**.
  
  Your task is to answer questions, summarize, analyze, and provide mechanical advice based on maintenance data.
  
  **Internet Access**: You have access to Google Search. Use it to look up technical specifications, torque settings, fluid capacities, common fault codes, and repair procedures for MB Axor MP3 and MB Actros MP4 trucks to provide the most accurate mechanical advice.
  
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
  - **Market Research**: Use Google Search to find current market prices for spare parts or services if the user asks "How much should this cost?" or "Is this a good price?". Compare the recorded costs in the database with current market rates.
  
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
    // Convert history to Gemini format
    const history = chatHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      history,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
      },
    });
    
    const response = await chat.sendMessage({ message: query });
    return response.text || "I couldn't generate a response.";
  } catch (e: any) {
    console.error("AI Analysis Error:", e);
    throw new Error(e.message || "AI Analysis Failed");
  }
}

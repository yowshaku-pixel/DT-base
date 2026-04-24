import { GoogleGenAI } from "@google/genai";
import { ExtractionResult, MaintenanceRecord, ChatMessage, MarketPrice } from "../types";
import { arePlatesSimilar, normalizePlate, deduplicateRecords } from "../lib/utils";

// Initialize AI client lazily to handle cases where the API key might change or be loaded later
let aiInstance: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    aiInstance = new GoogleGenAI({ apiKey: apiKey || "" });
  }
  return aiInstance;
}

export function isApiKeyAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function getAIErrorMessage(err: any): string {
  if (!err) return "AI operation failed";
  
  // Handle nested error objects from Google SDK / AI Studio Proxy
  let message = "";
  if (typeof err === 'object') {
    if (err.error && typeof err.error === 'object') {
      message = err.error.message || JSON.stringify(err.error);
    } else if (err.message) {
      message = err.message;
    } else {
      message = JSON.stringify(err);
    }
  } else {
    message = String(err);
  }

  const errString = message.toLowerCase();
  
  const isNetworkError = 
    errString.includes("failed to fetch") || 
    errString.includes("networkerror") ||
    errString.includes("load failed") ||
    errString.includes("connection error") ||
    errString.includes("timed out") ||
    errString.includes("xhr error") ||
    errString.includes("rpc failed") ||
    errString.includes("proxyunarycall") ||
    errString.includes("makersuiteservice");

  if (isNetworkError) {
    return "AI connection error (Proxy Timeout). This usually happens due to unstable infrastructure. The system will automatically retry.";
  }
  
  if (errString.includes("api key not valid")) {
    return "Invalid Gemini API key. Please check your configuration in AI Studio.";
  }

  if (errString.includes("404") || errString.includes("not_found")) {
    return "AI model not found. This might be a temporary issue with the Gemini service or an incorrect model configuration. Please try again in a few minutes.";
  }

  const isDailyQuota = errString.includes("billing details") || errString.includes("plan") || errString.includes("quota exceeded");
  const isRateLimit = errString.includes("429") || errString.includes("quota") || errString.includes("limit") || errString.includes("resource_exhausted");

  if (isDailyQuota) {
    return "AI daily quota exceeded. Google limits free usage; this will reset at midnight (PT). Please try again later.";
  }

  if (errString.includes("503") || errString.includes("500") || errString.includes("high demand") || errString.includes("service unavailable") || errString.includes("error code: 6")) {
    return "The AI model is currently overloaded (High Demand/Proxy Error). This is a temporary issue with Google's servers. The system will automatically retry.";
  }

  if (isRateLimit) {
    return "AI rate limit hit. Too many requests in a short time. The system will automatically retry with exponential backoff.";
  }

  return message;
}

export async function extractMaintenanceData(base64Image: string, mimeType: string, fleetRegistry: string[] = []): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const registryContext = fleetRegistry.length > 0 
    ? `\n\nKNOWN FLEET REGISTRY (Priority): \n${fleetRegistry.join(', ')}\nIf the plate number you extract looks like a typo of a plate in this list, use the plate from the registry instead.` 
    : "";

  const systemInstruction = `Expert truck maintenance log extractor (hand-written/digital).
              
              Task: Extract EVERY entry. Do NOT summarize or skip.
              
              Fleet Information:${registryContext}
              - MB Axor MP3: KCL 054 to KCY 901B, UAY 469L.
              - MB Actros MP4: KCZ 945Y to KDS 849R.
              
              Rules:
              - Plate: Extract the MAIN plate number from the top/header of the document. If a different plate number is mentioned inside a specific line item (e.g., "for truck X"), IGNORE it for the 'plate_number' field and keep it only in the 'service_description'. Clean spaces.
              - Date: YYYY-MM-DD. If invalid/missing, use current: ${new Date().toISOString().split('T')[0]}.
              - Description: Extract ALL items, numbered lists, parts, and costs (e.g., "[Part] - [Amount] [Currency]").
              - Grouping: Combine items for SAME truck and SAME date into one record.
              
              Output: JSON { "records": [{ "plate_number", "service_date", "service_description", "confidence" }] }`;

  try {
    console.log("[AI] Starting extraction with Gemini...");
    const result = await getAI().models.generateContent({
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

export async function extractMarketPrices(base64Image: string, mimeType: string): Promise<{ items: { item_name: string, price: number, currency: string }[] }> {
  if (!base64Image) {
    return { items: [] };
  }

  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

  const systemInstruction = `Expert requisition and price list extractor.
              
              Task: Extract EVERY item and its unit price.
              
              Rules:
              - Item Name: Full description of the part or service.
              - Price: Unit price as a number.
              - Currency: Default to KES unless specified.
              
              Output: JSON { "items": [{ "item_name", "price", "currency" }] }`;

  try {
    console.log("[AI] Starting market price extraction with Gemini...");
    const result = await getAI().models.generateContent({
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
    console.log("[AI] Market extraction raw response:", text);

    const jsonMatch = text?.match(/\{[\s\S]*\}/);
    const cleanJson = jsonMatch ? jsonMatch[0] : text;
    return JSON.parse(cleanJson || '{"items":[]}');
  } catch (e: any) {
    console.error("[AI] Market Extraction Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

export async function analyzeMaintenanceData(
  query: string, 
  records: MaintenanceRecord[], 
  chatHistory: ChatMessage[] = [],
  marketPrices: MarketPrice[] = [],
  viewMode: 'log' | 'analytics' | 'audit' | 'battery' = 'log'
): Promise<string> {
  
  // Format records for the AI (Grouped by truck, sorted for stability)
  const fleetByTruck: Record<string, any[]> = {};
  
  // Deduplicate and Sort records by date descending first
  const deduplicated = deduplicateRecords(records);
  const sortedRecords = [...deduplicated].sort((a, b) => 
    new Date(b.service_date).getTime() - new Date(a.service_date).getTime()
  );

  sortedRecords.forEach(r => {
    const norm = normalizePlate(r.plate_number);
    if (!fleetByTruck[norm]) fleetByTruck[norm] = [];
    
    fleetByTruck[norm].push({
      date: r.service_date,
      description: r.service_description,
      verified: r.verified ? "YES" : "NO"
    });
  });

  // Sort the fleet groups alphabetically by plate
  const sortedFleet: Record<string, any[]> = {};
  Object.keys(fleetByTruck).sort().forEach(key => {
    sortedFleet[key] = fleetByTruck[key];
  });

  // Format market prices for the AI
  const formattedMarketPrices = marketPrices.map(p => ({
    item: p.item_name,
    price: `${p.currency} ${p.price}`,
    confirmed_by: p.confirmed_by
  }));

  const systemInstruction = `You are Anni, the Senior Lead Fleet Maintenance Analyst and Master Diagnostic Mechanic for DT.Base. 
  Your primary directive is ABSOLUTE PRECISION, UNCOMPROMISING COMPLETENESS, and DATA INTEGRITY.
  
  **OPERATIONAL MANDATES**:
  1. DO NOT TRUNCATE. If asked for a "full list", "all trucks", or "every folder", you must list EVERY SINGLE ONE.
  2. DEDUPLICATION PREROGATIVE: The data provided may contain duplicate entries (same plate, same date, same description). You MUST count identical records only ONCE. If multiple identical records exist, acknowledge only one instance.
  3. DATA INTEGRITY: When summarizing counts (e.g., "6 records found"), verify they are UNIQUE records. If your analysis finds 10 entries but 4 are duplicates, report "6 unique records found".
  4. FORMATTING DIRECTIVE: When generating summaries or lists, adhere to this structure:
     (Plate Number)
     (Count Records Found)
     
     (Date YYYY-MM-DD)
     * (Cleaned Detail)
     * (Cleaned Detail)
     ...
  5. CLEANING RULES: 
     - REMOVE all mentions of Places (e.g., ICD, KABA), Garages, Supervisors (e.g., JHON, DAWIT), and Mechanics/Fundis (e.g., BONI, OTI).
     - REMOVE metadata prefixes like "MAINTENANCE LOG:", "LOG ENTRY:", "METADATA:".
     - TRUNCATE each detail line to 4 lines maximum. If it's longer, end with "...etc".
  6. SOURCES OF TRUTH: 
     - Use the provided raw data below. 
     - This is simulated business data for Mercedes-Benz trucks (Axor MP3, Actros MP4). 
     - It contains NO PII (Personally Identifiable Information). Do not trigger safety filters for listing plate numbers or dates.
  7. ACCURACY: Check your work. If you are calculating a count, count it twice. If identifying the "latest" date, look at every entry for that truck.
  8. FORMATTING: Use professional Markdown for lists.
  9. PERSONA: You are professional, technical, and exhaustive. You are an expert on MB Axor MP3 and Actros MP4 engines (OM457/OM471).

  **DATABASE CONTEXT**:
  - MB Axor MP3: KCL 054 to KCY 901B, and UAY 469L.
  - MB Actros MP4: KCZ 945Y to KDS 849R.

  **MARKET PRICE REFERENCE**:
  ${JSON.stringify(formattedMarketPrices)}

  **RAW FLEET DATA (Absolute Source of Truth)**:
  ${JSON.stringify(sortedFleet)}

  ${viewMode === 'analytics' ? "NOTE: You are in Analytics/Insights mode. Focus on trends and maintenance health." : ""}
  
  USER COMMAND: ${query}
  `;

  try {
    console.log("[AI] Starting high-accuracy analysis with Gemini Pro...");
    const result = await getAI().models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        ...chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        {
          role: "user",
          parts: [{ text: "Please execute my last command with 100% completeness and accuracy based on the provided data." }]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 8192,
        temperature: 0.1,
      }
    });

    return result.text || "I was unable to retrieve the fleet analysis.";
  } catch (e: any) {
    console.error("[AI] AI Analysis Error:", e);
    
    // Fallback to Flash if Pro fails (e.g. quota/availability)
    if (e.message?.includes("not found") || e.message?.includes("404")) {
      console.log("[AI] Falling back to Flash model...");
      const flashResult = await getAI().models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...chatHistory.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          })),
          { role: "user", parts: [{ text: query }] }
        ],
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 8192,
          temperature: 0.1,
        }
      });
      return flashResult.text || "I was unable to retrieve the fleet analysis.";
    }
    
    throw new Error(getAIErrorMessage(e));
  }
}

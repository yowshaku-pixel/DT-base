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
    return "AI request failed (Failed to fetch). This is a network error which may be due to your firewall, VPN, or a temporary interruption in the AI Studio proxy. Please try again.";
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

export async function extractMaintenanceData(
  base64Image: string, 
  mimeType: string, 
  fleetRegistry: string[] = [],
  historySummary: string = ""
): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  // Client-side: Call the server API
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch("/api/ai/extract-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image, mimeType, fleetRegistry, historySummary }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      return await response.json();
    } catch (e: any) {
      console.error("[AI] Client Extraction Error:", e);
      throw new Error(getAIErrorMessage(e));
    }
  }

  // Server-side: Direct Gemini call
  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const registryContext = fleetRegistry.length > 0 
    ? `\n\nKNOWN FLEET REGISTRY (Priority): \n${fleetRegistry.join(', ')}\nIf the plate number you extract looks like a typo of a plate in this list, use the plate from the registry instead.` 
    : "";

  const historyContext = historySummary 
    ? `\n\nFLEET HISTORY CONTEXT (Use for resolving handwriting ambiguities): \n${historySummary}`
    : "";

  const systemInstruction = `Expert truck maintenance log extractor (hand-written/digital).
              
              Task: Extract EVERY entry. Do NOT summarize or skip.
              
              Fleet Information:${registryContext}${historyContext}
              - MB Axor MP3: KCL 054 to KCY 901B, UAY 469L.
              - MB Actros MP4: KCZ 945Y to KDS 849R.
              
              Rules:
              - Date Propagation: If a date header (e.g. "12/04") appears, apply it to all subsequent entries until a new date.
              - Plate: Use the Registry list to resolve handwriting ambiguities (e.g. '8' vs 'B').
              - History Awareness: If service text is blurry, cross-reference the FLEET HISTORY provided to guess the most likely component name.
              - Sub-entries: Each line under a vehicle plate is a record.
              - Amounts: Extract price/amount for each part/service if listed.
              
              Output: JSON { "records": [{ "plate_number", "service_date", "service_description", "amount", "currency", "confidence" }] }`;

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
    console.error("[AI] AI Server Extraction Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

export async function extractMarketPrices(base64Image: string, mimeType: string): Promise<{ items: { item_name: string, price: number, currency: string }[] }> {
  if (!base64Image) {
    return { items: [] };
  }

  // Client-side: Call the server API
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch("/api/ai/extract-market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Image, mimeType }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      return await response.json();
    } catch (e: any) {
      console.error("[AI] Client Market Extraction Error:", e);
      throw new Error(getAIErrorMessage(e));
    }
  }

  // Server-side: Direct Gemini call
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
    console.error("[AI] AI Server Market Extraction Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

export async function analyzeMaintenanceData(
  query: string, 
  records: MaintenanceRecord[], 
  chatHistory: ChatMessage[] = [],
  marketPrices: MarketPrice[] = [],
  viewMode: 'log' | 'analytics' | 'audit' | 'battery' | 'marketplace' | 'advanced-search' = 'log'
): Promise<string> {
  
  // Client-side: Call the server API
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, records, chatHistory, marketPrices, viewMode }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      const data = await response.json();
      return data.result;
    } catch (e: any) {
      console.error("[AI] Client Analysis Error:", e);
      throw new Error(getAIErrorMessage(e));
    }
  }

  // Server-side: Direct Gemini call
  // Format records for the AI (Grouped by truck, sorted for stability)
  const fleetByTruck: Record<string, any[]> = {};
  
  // Deduplicate and Sort records by date descending first
  const deduplicated = deduplicateRecords(records);
  const sortedRecords = [...deduplicated].sort((a, b) => 
    new Date(b.service_date).getTime() - new Date(a.service_date).getTime()
  );

  // Pre-compute Intelligence Summary for the AI
  const fleetSummary: Record<string, { total_records: number, last_service: string, common_issues: string[], mtbf_days: number }> = {};

  sortedRecords.forEach(r => {
    const norm = normalizePlate(r.plate_number);
    if (!fleetByTruck[norm]) {
      fleetByTruck[norm] = [];
      fleetSummary[norm] = { total_records: 0, last_service: r.service_date, common_issues: [], mtbf_days: 0 };
    }
    
    fleetByTruck[norm].push({
      date: r.service_date,
      description: r.service_description,
      verified: r.verified ? "YES" : "NO"
    });

    fleetSummary[norm].total_records++;
    // Add common terms (simple frequency check)
    const words = r.service_description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    fleetSummary[norm].common_issues.push(...words);
  });

  // Refine common issues and MTBF per truck
  Object.keys(fleetSummary).forEach(plate => {
    const counts: Record<string, number> = {};
    fleetSummary[plate].common_issues.forEach(w => counts[w] = (counts[w] || 0) + 1);
    fleetSummary[plate].common_issues = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(e => e[0].toUpperCase());

    // Calculate approximate MTBF
    const pRecords = fleetByTruck[plate];
    if (pRecords.length > 1) {
      const dates = pRecords.map(pr => new Date(pr.date).getTime()).sort((a, b) => a - b);
      const totalDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
      fleetSummary[plate].mtbf_days = Math.round(totalDays / (pRecords.length - 1));
    }
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

  const systemInstruction = `You are Anni, the core AI engine of DT.Base. You are a professional, mature, and deeply practical fleet maintenance analyst.
  
  **PRODUCT STANDARDS (PERSONA & TONE)**:
  - Speak with the quiet confidence of an expert assistant. Be encouraging, empathetic, and professional.
  - Avoid AI cheerleading: No "Sure, I can help with that!" or "As an AI...". Limit exclamation points.
  - Prioritize clear, actionable answers. Provide direct solutions first.
  - Keep responses concise. Use clean formatting (bullet points, bold text) for quick scanning.
  - Anticipate next needs (e.g., offering to refine a search or summarize a truck's specific category).
  
  **DIAGNOSTIC BRAIN (Pre-Learned Intelligence)**:
  - Your primary directive is ABSOLUTE PRECISION and DATA INTEGRITY.
  - Expert on MB Axor MP3 and Actros MP4 engines (OM457/OM471).
  
  **FLEET INTELLIGENCE SUMMARY**:
  ${JSON.stringify(fleetSummary)}

  **REGISTRY MANAGEMENT**:
  - NEW trucks: [UPDATE_REGISTRY: PLATE_NUMBER].
  
  **OPERATIONAL MANDATES**:
  1. DO NOT TRUNCATE. 
  2. DEDUPLICATION PREROGATIVE: Identity identical records only ONCE.
  3. CLEANING RULES: REMOVE mentors of Places, Garages, Supervisors, and Mechanics.
  
  **MARKET PRICE REFERENCE**:
  ${JSON.stringify(formattedMarketPrices)}

  **RAW FLEET DATA**:
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

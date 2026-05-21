import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult, MaintenanceRecord, ChatMessage, MarketPrice } from "../types";
import { arePlatesSimilar, normalizePlate, deduplicateRecords } from "../lib/utils";

// Initialize AI client lazily to handle cases where the API key might change or be loaded later
let aiInstance: GoogleGenAI | null = null;

function getAI(apiKeyOverride?: string): GoogleGenAI {
  if (apiKeyOverride) {
    return new GoogleGenAI({ 
      apiKey: apiKeyOverride,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-override',
        }
      }
    });
  }
  
  const envKey = typeof process !== 'undefined' && process?.env ? process.env.GEMINI_API_KEY : "";
  if (envKey) {
    if (!aiInstance) {
      aiInstance = new GoogleGenAI({ 
        apiKey: envKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiInstance;
  }
  
  return new GoogleGenAI({ 
    apiKey: "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build-unconfigured',
      }
    }
  });
}

async function generateContentWithRetry(params: any, maxRetries = 3, initialDelay = 1500, apiKeyOverride?: string): Promise<any> {
  const baseModel = params.model || "gemini-3.5-flash";
  
  // Decide the fallback model chain to use when limits/quotas are hit
  let fallbackChain: string[] = [];
  if (baseModel === "gemini-3.5-flash") {
    fallbackChain = [
      "gemini-3.5-flash", 
      "gemini-3.1-flash-lite", 
      "gemini-2.5-flash", 
      "gemini-2.5-pro"
    ];
  } else if (baseModel === "gemini-3.1-pro-preview") {
    fallbackChain = [
      "gemini-3.1-pro-preview", 
      "gemini-2.5-pro",
      "gemini-3.5-flash", 
      "gemini-3.1-flash-lite", 
      "gemini-2.5-flash"
    ];
  } else {
    fallbackChain = [
      baseModel,
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro"
    ];
  }

  let attempt = 0;
  let modelIndex = 0;

  while (modelIndex < fallbackChain.length) {
    const activeModel = fallbackChain[modelIndex];
    const attemptParams = { ...params, model: activeModel };
    
    try {
      console.log(`[AI] Attempting request using model: ${activeModel} (Current fallback chain index: ${modelIndex}, model attempt: ${attempt})`);
      return await getAI(apiKeyOverride).models.generateContent(attemptParams);
    } catch (error: any) {
      attempt++;
      
      let message = "";
      if (typeof error === 'object') {
        if (error.error && typeof error.error === 'object') {
          message = error.error.message || JSON.stringify(error.error);
        } else if (error.message) {
          message = error.message;
        } else {
          message = JSON.stringify(error);
        }
      } else {
        message = String(error);
      }
      
      const errString = message.toLowerCase();
      
      // Separate standard transient rate-limits (QPM / RPM / 429) from complete daily/billing quota blockades.
      // Genuine daily limit messages contain "perday", "daily", "billing" or "limit: 0".
      const isDailyLimitExceeded = 
        errString.includes("perday") || 
        errString.includes("daily quota") || 
        errString.includes("daily limit") || 
        errString.includes("billing") || 
        errString.includes("limit: 0");
        
      const isInvalidKey = errString.includes("api key not valid");
      
      if (isDailyLimitExceeded) {
        console.log(`[AI] Info (Expected): Model ${activeModel} daily quota limit reached on attempt ${attempt}. Switching model immediate.`);
      } else {
        console.warn(`[AI] Error with model ${activeModel} (attempt ${attempt}): "${message.substring(0, 150)}..."`);
      }
      
      // Let standard rate limits (RESOURCE_EXHAUSTED / 429) retry on the current active model FIRST,
      // and only switch to fallback if we hit 3 attempts or a firm daily/billing block.
      const shouldSwitchModel = isDailyLimitExceeded || isInvalidKey || attempt >= 3;
      
      if (shouldSwitchModel) {
        modelIndex++;
        if (modelIndex < fallbackChain.length) {
          console.log(`[AI] Info: Switching from ${activeModel} to fallback model: ${fallbackChain[modelIndex]} (attempts: ${attempt}, daily limit: ${isDailyLimitExceeded})`);
          attempt = 0; // reset attempts for the next model
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          throw error;
        }
      }

      // Calculate exponential backoff delay with random jitter (between 0 and 500ms) to spread out parallel calls
      const delay = initialDelay * Math.pow(2.2, attempt - 1) + Math.random() * 500;
      console.warn(`[AI] Transient rate limit or error. Retrying same model ${activeModel} in ${Math.round(delay)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

export function isApiKeyAvailable(): boolean {
  if (typeof process !== 'undefined' && process?.env) {
    return !!process.env.GEMINI_API_KEY;
  }
  return false;
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

  const isDailyQuota = 
    errString.includes("billing details") || 
    errString.includes("plan") || 
    errString.includes("perday") || 
    errString.includes("daily quota") || 
    errString.includes("daily limit");
    
  const isRateLimit = 
    errString.includes("429") || 
    errString.includes("quota exceeded") || 
    errString.includes("quota limit") || 
    errString.includes("limit") || 
    errString.includes("resource_exhausted") || 
    errString.includes("too many requests");

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
  historySummary: string = "",
  apiKeyOverride?: string
): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  // Client-side: Call the server API
  if (typeof window !== 'undefined') {
    try {
      const customKey = localStorage.getItem("DT_BASE_CUSTOM_GEMINI_API_KEY") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customKey) {
        headers["x-gemini-api-key"] = customKey;
      }
      const response = await fetch("/api/ai/extract-maintenance", {
        method: "POST",
        headers,
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
    const result = await generateContentWithRetry({
      model: "gemini-3.5-flash",
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
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            records: {
              type: Type.ARRAY,
              description: "List of extracted maintenance records",
              items: {
                type: Type.OBJECT,
                properties: {
                  plate_number: { type: Type.STRING, description: "Normalized license plate number" },
                  service_date: { type: Type.STRING, description: "Service date in YYYY-MM-DD format" },
                  service_description: { type: Type.STRING, description: "Detailed description of the service" },
                  amount: { type: Type.NUMBER, description: "Amount or cost" },
                  currency: { type: Type.STRING, description: "Currency (defaults to KES)" },
                  confidence: { type: Type.NUMBER, description: "Confidence score between 0 and 1" }
                },
                required: ["plate_number", "service_date", "service_description"]
              }
            }
          },
          required: ["records"]
        }
      }
    }, 3, 1500, apiKeyOverride);

    const text = result.text;
    console.log("[AI] Extraction raw response:", text);

    if (!text) {
      return { records: [] };
    }
    return JSON.parse(text);
  } catch (e: any) {
    console.error("[AI] AI Server Extraction Error:", e);
    throw new Error(getAIErrorMessage(e));
  }
}

export async function extractMarketPrices(base64Image: string, mimeType: string, apiKeyOverride?: string): Promise<{ items: { item_name: string, price: number, currency: string }[] }> {
  if (!base64Image) {
    return { items: [] };
  }

  // Client-side: Call the server API
  if (typeof window !== 'undefined') {
    try {
      const customKey = localStorage.getItem("DT_BASE_CUSTOM_GEMINI_API_KEY") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customKey) {
        headers["x-gemini-api-key"] = customKey;
      }
      const response = await fetch("/api/ai/extract-market", {
        method: "POST",
        headers,
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
    const result = await generateContentWithRetry({
      model: "gemini-3.5-flash",
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
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              description: "List of extracted requisition and parts/service prices",
              items: {
                type: Type.OBJECT,
                properties: {
                  item_name: { type: Type.STRING, description: "Item description" },
                  price: { type: Type.NUMBER, description: "Unit price of the item" },
                  currency: { type: Type.STRING, description: "Currency (defaults to KES)" }
                },
                required: ["item_name", "price", "currency"]
              }
            }
          },
          required: ["items"]
        }
      }
    }, 3, 1500, apiKeyOverride);

    const text = result.text;
    console.log("[AI] Market extraction raw response:", text);

    if (!text) {
      return { items: [] };
    }
    return JSON.parse(text);
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
  viewMode: 'log' | 'analytics' | 'audit' | 'battery' | 'marketplace' | 'advanced-search' = 'log',
  apiKeyOverride?: string
): Promise<string> {
  
  // Client-side: Call the server API
  if (typeof window !== 'undefined') {
    try {
      const customKey = localStorage.getItem("DT_BASE_CUSTOM_GEMINI_API_KEY") || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (customKey) {
        headers["x-gemini-api-key"] = customKey;
      }
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers,
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
    console.log("[AI] Starting analysis with Gemini Flash (High Capacity Free Tier)...");
    const result = await generateContentWithRetry({
      model: "gemini-3.5-flash",
      contents: [
        ...chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        {
          role: "user",
          parts: [{ text: query || "Please execute my last command with 100% completeness and accuracy based on the provided data." }]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 8192,
        temperature: 0.1,
      }
    }, 3, 1500, apiKeyOverride);

    return result.text || "I was unable to retrieve the fleet analysis.";
  } catch (e: any) {
    console.error("[AI] AI Analysis Error:", e);
    
    // If Flash fails (less likely to be quota but possible), we catch and return error message
    throw new Error(getAIErrorMessage(e));
  }
}

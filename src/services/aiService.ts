import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult, MaintenanceRecord, ChatMessage } from "../types";

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
              
              Data Structure:
              - Plate Number: Identify the truck's main plate number. 
                * IMPORTANT: Ignore any trailer numbers. A trailer number usually appears after a "/" or a "-". 
                * Example: "Kcw 822 b/Zg 1361" -> Extract only "Kcw 822 b".
                * Example: "Kcn 851 s /zf 7827 (Gadano)" -> Extract only "Kcn 851 s".
                * Example: "Kdm 703 f - beko" -> Extract only "Kdm 703 f".
                * Clean the plate number: remove extra spaces and ensure it's the primary truck ID.
              - Date: The date the work was done. Convert to YYYY-MM-DD format. If the date is missing or marked as "—", use the current date: ${new Date().toISOString().split('T')[0]}.
              - Service Description: What was fixed or replaced. Include the general log description, specific spare parts, and any metadata like "Garage", "Supervisor", or "Fundi" (mechanic).
              
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
  chatHistory: ChatMessage[] = []
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Format records for the AI
  const formattedRecords = records.map(r => ({
    plate: r.plate_number,
    date: r.service_date,
    desc: r.service_description
  }));

  const systemInstruction = `You are an expert fleet maintenance analyst for DT.Base.
  
  Your task is to answer questions, summarize, analyze, and organize maintenance data for a fleet of trucks.
  
  Context:
  - You have access to a list of maintenance records.
  - Plate numbers follow a specific similarity rule: if more than 5 characters match at the same positions, they are the same truck.
  - Trailer numbers (after / or -) are ignored.
  
  Instructions:
  - Be concise and professional.
  - If asked to summarize, group by truck or by type of work.
  - If asked to analyze, look for patterns (e.g., recurring issues with a specific truck).
  - If asked to organize, provide a structured list or table-like format in markdown.
  - If the data doesn't contain the answer, say so clearly.
  
  Current Data:
  ${JSON.stringify(formattedRecords, null, 2)}
  `;

  try {
    const chat = ai.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction,
      },
    });

    // Convert history to Gemini format
    // Note: Gemini chat history is handled by the chat object, but we can also pass it
    // For simplicity, we'll just send the current query as the first message if it's a new chat
    // or use the history if provided.
    
    const response = await chat.sendMessage({ message: query });
    return response.text || "I couldn't generate a response.";
  } catch (e: any) {
    console.error("AI Analysis Error:", e);
    throw new Error(e.message || "AI Analysis Failed");
  }
}

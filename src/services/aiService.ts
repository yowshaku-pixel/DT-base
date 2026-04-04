import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";

// Use the API key from environment variables (Vite or process.env)
const getApiKey = () => {
  // In AI Studio Build, the key is usually available as process.env.GEMINI_API_KEY
  // but for client-side apps, Vite doesn't automatically expose process.env.
  // We check both Vite's import.meta.env and a global process.env if it exists.
  
  const viteKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
  const processKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '';
  
  console.log("[DEBUG] getApiKey: viteKey exists:", !!viteKey);
  console.log("[DEBUG] getApiKey: processKey exists:", !!processKey);
  
  const key = viteKey || processKey;
  return key && key !== 'MY_GEMINI_API_KEY' ? key : null;
};

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
              text: `You are an expert at reading hand-written maintenance logs for trucks. 
              
              Task: Extract all maintenance entries from the provided image.
              
              Context:
              - The image is likely a photo of a notebook or a digital log.
              - Handwriting may be in script or cursive.
              - Look for dates, truck plate numbers, and descriptions of mechanical work or parts.
              
              Data Structure:
              - Plate Number: Identify the truck (e.g., "KCL 054T", "ZEB 123").
              - Date: The date the work was done (e.g., "27/04/21", "May 5th"). Convert to YYYY-MM-DD if possible, otherwise keep as is.
              - Service Description: What was fixed or replaced (e.g., "Oil change", "Brake pads", "New tire").
              
              Important:
              - If multiple items are listed under one date/plate, create a separate record for each item.
              - If the handwriting is messy, do your best to guess based on context.
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
    
    if (e.message?.includes("API_KEY_INVALID")) {
      throw new Error("Invalid API Key: Please check your Gemini API Key in the 'Secrets' tab.");
    }
    if (e.message?.includes("quota") || e.message?.includes("429") || e.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("AI Rate Limit Exceeded (429): Please wait a minute before trying again.");
    }
    
    throw new Error(e.message || "AI Extraction Failed");
  }
}

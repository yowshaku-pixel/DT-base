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
              text: `Extract truck maintenance records from this image. 
              
              This image may be a digital screenshot with a script/cursive font or a photo of a notebook.
              
              Layout Recognition:
              - Date & Plate: Usually on the left side (e.g., "27 April 2021", "KCL 054T").
              - Service Description: Often on the far right side (e.g., "Air bag", "Bushes", "Sump oil pan").
              
              Strictly look for:
              1. Plate Number: (e.g., KCL 054T).
              2. Date: (e.g., 27 April 2021).
              3. Service Description: The mechanical issue or part replaced.
              
              Guidelines:
              - Handle script/cursive fonts carefully.
              - If one date/plate has multiple items listed on the right, create a separate record for each item.
              - Ignore phone UI elements (status bar, navigation).
              
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
                  plateNumber: { type: Type.STRING, description: "The truck's plate number" },
                  date: { type: Type.STRING, description: "The date of service (YYYY-MM-DD if possible)" },
                  service: { type: Type.STRING, description: "Description of the work done" },
                  confidence: { type: Type.NUMBER, description: "Confidence score from 0 to 1" },
                },
                required: ["plateNumber", "date", "service"],
              },
            },
          },
          required: ["records"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text);
  } catch (e: any) {
    console.error("AI Extraction Error:", e);
    if (e.message?.includes("API_KEY_INVALID")) {
      throw new Error("Invalid API Key: Please check your Gemini API Key in the 'Secrets' tab.");
    }
    throw new Error(`AI Extraction Failed: ${e.message || "Unknown error"}`);
  }
}

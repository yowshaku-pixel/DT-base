import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult } from "../types";

export async function extractMaintenanceData(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  if (!base64Image) {
    return { records: [] };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const base64Data = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;

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

  try {
    return JSON.parse(response.text || '{"records": []}');
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return { records: [] };
  }
}

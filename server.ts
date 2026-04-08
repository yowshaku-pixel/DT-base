import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

const envResult = dotenv.config();
console.log("[SERVER] Dotenv config loaded:", !!envResult.parsed);
console.log("[SERVER] GEMINI_API_KEY present in env:", !!process.env.GEMINI_API_KEY);
console.log("[SERVER] VITE_GEMINI_API_KEY present in env:", !!process.env.VITE_GEMINI_API_KEY);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Request logger for debugging
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/')) {
      console.log(`[API] ${req.method} ${req.url}`);
    }
    next();
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/chat", async (req, res) => {
    console.log("[SERVER] Handling /api/chat request");
    console.log("[SERVER] Request body keys:", Object.keys(req.body || {}));
    try {
      const { query, history, systemInstruction, model = "gemini-3-flash-preview" } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      console.log("[SERVER] API Key present:", !!apiKey);
      
      if (!apiKey) {
        console.error("Missing API Key on server");
        return res.status(500).json({ error: "Gemini API Key is missing on server. Please set GEMINI_API_KEY in your environment." });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const chat = ai.chats.create({
        model: model === "gemini-1.5-flash" ? "gemini-3-flash-preview" : model,
        history: history || [],
        config: {
          systemInstruction: systemInstruction
        }
      });

      const result = await chat.sendMessage({ message: query });
      const text = result.text;

      res.json({ text });
    } catch (error: any) {
      console.error("Server AI Error:", error);
      res.status(500).json({ 
        error: error.message || "Internal Server Error",
        details: error.toString()
      });
    }
  });

  app.post("/api/extract", async (req, res) => {
    try {
      const { base64Data, mimeType, systemInstruction } = req.body;
      
      const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      
      if (!apiKey) {
        console.error("Missing API Key on server");
        return res.status(500).json({ error: "Gemini API Key is missing on server. Please set GEMINI_API_KEY in your environment." });
      }

      const ai = new GoogleGenAI({ apiKey });
      
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

      try {
        // Clean markdown if present
        const jsonMatch = text?.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : text;
        res.json(JSON.parse(cleanJson || "{}"));
      } catch (parseError) {
        console.error("JSON Parse Error on server:", text);
        res.status(500).json({ error: "AI returned invalid JSON format." });
      }
    } catch (error: any) {
      console.error("Server Extraction Error:", error);
      res.status(500).json({ 
        error: error.message || "Internal Server Error",
        details: error.toString()
      });
    }
  });

  // Catch-all for API routes to prevent HTML fallback
  app.all("/api/*all", (req, res) => {
    console.warn(`[SERVER] API Route not found: ${req.method} ${req.url}`);
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

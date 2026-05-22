import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { extractMaintenanceData, extractMarketPrices, analyzeMaintenanceData } from "./src/services/aiService.ts";

// Resolve the base directory safely supporting both ESM (tsx in development) and CJS (production bundling)
const getBaseDir = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return path.dirname(fileURLToPath(import.meta.url));
    }
  } catch (e) {
    // ignore error in non-ESM environments
  }
  try {
    // We use eval to safely access global __dirname without compilation block-scope conflicts
    const cjsDir = eval("__dirname");
    if (cjsDir) return cjsDir;
  } catch (e) {
    // ignore error in non-CJS environments
  }
  return process.cwd();
};

const baseDir = getBaseDir();

// 1. Try default process.cwd() first
dotenv.config();

// 2. Fallback relative paths for absolute robustness in bundles and virtual drives (e.g., Termux)
try {
  // Try loading from project root folder if running from dist/ directory (production)
  dotenv.config({ path: path.resolve(baseDir, "../.env") });
  // Try loading from the same folder as the script (development)
  dotenv.config({ path: path.resolve(baseDir, ".env") });
} catch (e) {
  console.warn("[SERVER] Unable to resolve relative path for .env file:", e);
}

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

  // AI Proxy Routes
  app.post("/api/ai/extract-maintenance", async (req, res) => {
    try {
      const { base64Image, mimeType, fleetRegistry, historySummary } = req.body;
      const apiKeyOverride = req.headers['x-gemini-api-key'] as string;
      const result = await extractMaintenanceData(base64Image, mimeType, fleetRegistry, historySummary, apiKeyOverride);
      res.json(result);
    } catch (error: any) {
      console.error("[SERVER] AI Extraction Error:", error);
      res.status(500).json({ error: error.message || "AI Extraction failed" });
    }
  });

  app.post("/api/ai/extract-market", async (req, res) => {
    try {
      const { base64Image, mimeType } = req.body;
      const apiKeyOverride = req.headers['x-gemini-api-key'] as string;
      const result = await extractMarketPrices(base64Image, mimeType, apiKeyOverride);
      res.json(result);
    } catch (error: any) {
      console.error("[SERVER] AI Market Extraction Error:", error);
      res.status(500).json({ error: error.message || "AI Market Extraction failed" });
    }
  });

  app.post("/api/ai/analyze", async (req, res) => {
    try {
      const { query, records, chatHistory, marketPrices, viewMode } = req.body;
      const apiKeyOverride = req.headers['x-gemini-api-key'] as string;
      const result = await analyzeMaintenanceData(query, records, chatHistory, marketPrices, viewMode, apiKeyOverride);
      res.json({ result });
    } catch (error: any) {
      console.error("[SERVER] AI Analysis Error:", error);
      res.status(500).json({ error: error.message || "AI Analysis failed" });
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

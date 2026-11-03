// Local test server: serves public/ and runs api/check.js like Vercel does.
// Usage: ANTHROPIC_API_KEY=... npm run dev   (or MOCK_AI=1 npm run dev to skip the AI)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";
import handler from "../api/check.js";

const PORT = Number(process.env.PORT ?? 3000);
const pub = new URL("../public/", import.meta.url);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

const MOCK = {
  kind: "menu",
  summary: "Two dishes need changes and one is fine.",
  items: [
    { name: "Caesar salad", rating: "amber", rule_ids: ["raw-egg-foods", "chicken-cold"], explanation: "Caesar dressing is often made with raw egg, and the chicken may be cold.", ask_kitchen: "Could I have it without the dressing, with the chicken served hot?", confidence: "medium" },
    { name: "Rockmelon and prosciutto", rating: "red", rule_ids: ["fruit-pre-cut", "deli-meats-cold"], explanation: "Pre-cut melon and cold cured meat can carry listeria.", ask_kitchen: null, confidence: "high" },
    { name: "Grilled barramundi with chips", rating: "green", rule_ids: ["fish-cooked"], explanation: "Cooked fish served hot is fine.", ask_kitchen: null, confidence: "high" },
  ],
};

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/check") {
    req.body = await readBody(req);
    if (process.env.MOCK_AI) {
      res.setHeader("Content-Type", "application/json");
      return setTimeout(() => res.end(JSON.stringify(MOCK)), 800);
    }
    return handler(req, res);
  }
  const path = normalize(url.pathname === "/" ? "/index.html" : url.pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(new URL(`.${path}`, pub));
    res.setHeader("Content-Type", TYPES[extname(path)] ?? "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`App running at http://localhost:${PORT}`));

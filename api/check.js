// Serverless function: checks a photo (dish, menu, label) or a typed food
// against the pregnancy rules using Claude. Runs on Vercel at /api/check.
// The API key stays here on the server (env var ANTHROPIC_API_KEY).

import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, cleanResult, OUTPUT_SCHEMA } from "../lib/prompt.js";

// Which Claude model checks the photos. Change it in Vercel (env var CLAUDE_MODEL)
// without touching code. Rough cost per photo: Opus 5.5 ~8c, Sonnet 5.5 ~3-4c, Haiku 5.5 <1c.
export const MODELS = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};
const DEFAULT_MODEL = "sonnet";
// Server-side refusal fallback is offered for these models only.
const FALLBACK_MODELS = new Set([MODELS.opus, MODELS.sonnet]);

export function pickModel(value) {
  const key = String(value ?? "").trim().toLowerCase();
  if (MODELS[key]) return MODELS[key];
  if (Object.values(MODELS).includes(key)) return key;
  return MODELS[DEFAULT_MODEL];
}

export function requestParams(model, system, content) {
  const params = {
    model,
    max_tokens: 16000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: OUTPUT_SCHEMA },
    },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  return params;
}
const MAX_IMAGE_BYTES = 3_500_000; // after base64 decode; Vercel caps request bodies at 4.5 MB
const MAX_TEXT_CHARS = 500;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MODES = { dish: "a dish or plate of food", menu: "a restaurant or cafe menu", label: "a food packet or label" };

const rulesFile = JSON.parse(
  readFileSync(new URL("../data/pregnancy_food_rules.json", import.meta.url), "utf8"),
);
const systemPrompt = buildSystemPrompt(rulesFile);

let client;
function getClient() {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY
  return client;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function buildUserContent(body) {
  const mode = MODES[body?.mode] ? body.mode : null;

  if (body?.image) {
    const { data, media_type: mediaType } = body.image;
    if (typeof data !== "string" || !IMAGE_TYPES.has(mediaType)) {
      return { error: "Please send a JPEG, PNG, WebP or GIF photo." };
    }
    if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) {
      return { error: "That photo is too big. Please try a smaller one." };
    }
    const hint = mode
      ? `She says this is a photo of ${MODES[mode]}.`
      : "Work out whether this is a dish, a menu or a food label.";
    return {
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data } },
        { type: "text", text: `${hint} Check every food item against the rules.` },
      ],
    };
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text) {
    if (text.length > MAX_TEXT_CHARS) return { error: "Please type a shorter food name." };
    return {
      content: [
        {
          type: "text",
          text: `She typed this food or dish: "${text}". Set kind to "food" and check it against the rules. If it is a dish, think about its usual ingredients.`,
        },
      ],
    };
  }

  return { error: "Send a photo or type a food." };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });

  const passcode = process.env.APP_PASSCODE;
  if (passcode && req.headers["x-app-passcode"] !== passcode) {
    return send(res, 401, { error: "passcode", message: "Wrong or missing passcode." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return send(res, 500, { error: "The app's AI key is not set up yet (ANTHROPIC_API_KEY)." });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return send(res, 400, { error: "Bad request." });
    }
  }

  const built = buildUserContent(body);
  if (built.error) return send(res, 400, { error: built.error });

  try {
    const model = pickModel(process.env.CLAUDE_MODEL);
    const response = await getClient().beta.messages.create(requestParams(model, systemPrompt, built.content));
    // Shows in Vercel logs, so the real cost of each check can be seen.
    const u = response.usage ?? {};
    console.log(
      `check model=${response.model} in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens}`,
    );

    if (response.stop_reason === "refusal") {
      return send(res, 422, { error: "The AI couldn't check this one. Please try another photo." });
    }
    if (response.stop_reason === "max_tokens") {
      return send(res, 422, { error: "That was too much to check at once. Try a photo of part of the menu." });
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock) return send(res, 502, { error: "The AI gave no answer. Please try again." });

    const result = cleanResult(JSON.parse(textBlock.text), rulesFile);
    return send(res, 200, result);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth failed:", error.message);
      return send(res, 500, { error: "The app's AI key isn't working. Check ANTHROPIC_API_KEY." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return send(res, 429, { error: "Too many checks right now. Please wait a minute and try again." });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Anthropic bad request:", error.message);
      return send(res, 400, {
        error: "The AI couldn't check that. If this keeps happening, the AI account may be out of credit.",
      });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return send(res, 502, { error: "The AI service had a problem. Please try again." });
    }
    console.error("Check failed:", error);
    return send(res, 500, { error: "Something went wrong. Please try again." });
  }
}

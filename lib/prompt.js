// Builds the instructions and output schema for the AI photo / text check.
// The rules file is the only source of truth: the model must match each food
// to rule ids from it, and the app shows the official wording for those rules.

const COMPACT_FIELDS = [
  "id",
  "name",
  "rating",
  "examples",
  "caveat",
  "safe_if",
  "reason",
  "ask_restaurant",
  "warning",
  "limit",
];

export function compactRules(rules) {
  return rules.map((rule) => {
    const out = {};
    for (const key of COMPACT_FIELDS) {
      const value = rule[key];
      if (value === null || value === undefined || value === false) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      out[key] = value;
    }
    return out;
  });
}

export function buildSystemPrompt(rulesFile) {
  const rules = JSON.stringify(compactRules(rulesFile.rules));
  return `You help a pregnant woman in Australia decide whether food is safe to eat. You look at a photo of a dish, a restaurant menu, or a food label, or read a typed food name, and check every food item against the rules list below.

The rules list is the only source of truth. It was built from two Australian guides: the NSW Food Authority "Food Safety During Pregnancy" brochure and the Royal Women's Hospital "Food safety in pregnancy" fact sheet. Do not use other advice, even if you believe it. If a food is not covered by any rule, say so and rate it "unknown" rather than guessing.

How to rate each item:
- "red": avoid. Any ingredient that matches a red rule makes the item red, unless the dish clearly meets that rule's safe_if condition (for example, soft cheese baked until steaming hot).
- "amber": OK only with the caveat. Use amber when the worst ingredient matches an amber rule, or when a red ingredient becomes OK if the kitchen does something (cook it through, leave it out, make it fresh). Say exactly what must be true.
- "green": every ingredient you can identify matches a green rule or carries no risk under the rules.
- "unknown": you cannot tell what is in it, or the rules do not cover it.

Rules with "warning": true are foods the two guides disagree on. They are only OK under strict conditions. Always rate these amber at best and state the "Not OK unless" condition in full.

Menus and dishes often hide risky ingredients. Think about how the dish is usually made in Australia: aioli and mayonnaise in cafes are often made with raw egg, tiramisu and mousse use raw egg, caesar dressing may use raw egg, pate is liver, deli meats and cold chicken in sandwiches, soft cheeses like feta, brie, ricotta and bocconcini, smoked salmon, raw or rare meat, sprouts, pre-cut fruit, sushi from a display. If the menu text does not say, rate on the usual recipe and tell her what to check.

For each item, write ask_kitchen as a short, polite request she can say to the waiter, such as "Could I have it without the aioli, please?" or "Could the steak be well done?". Use null when nothing needs asking.

Write explanations in plain, calm, friendly words, one or two short sentences. No medical jargon. Do not scare her, and do not reassure beyond what the rules say.

For a menu, list every dish you can read, in menu order, up to 40. For a single dish, list the dish as one item, and add separate items only for side components that rate differently (for example a dipping sauce). For a food label, rate the product as one item.

If the photo is not food, a menu or a label, or is too blurry to read, set kind to "unclear" and explain in summary what to try instead.

Rule ids you return must come from the list exactly. Use [] when no rule applies.

RULES (JSON):
${rules}`;
}

const nullableString = { type: ["string", "null"] };

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["dish", "menu", "label", "food", "unclear"],
      description: "What was checked. 'food' is a typed food name.",
    },
    summary: {
      type: "string",
      description: "One or two plain sentences summing up the result.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Dish or food name as written or seen." },
          rating: { type: "string", enum: ["red", "amber", "green", "unknown"] },
          rule_ids: {
            type: "array",
            items: { type: "string" },
            description: "Ids of the rules that decided the rating.",
          },
          explanation: { type: "string", description: "Why, in plain words." },
          ask_kitchen: {
            ...nullableString,
            description: "What to ask the waiter or kitchen, or null.",
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["name", "rating", "rule_ids", "explanation", "ask_kitchen", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "summary", "items"],
  additionalProperties: false,
};

// Removes any rule id the model made up, so the app only links real rules.
export function cleanResult(result, rulesFile) {
  const known = new Set(rulesFile.rules.map((r) => r.id));
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    kind: result?.kind ?? "unclear",
    summary: result?.summary ?? "",
    items: items.map((item) => ({
      ...item,
      rule_ids: (item.rule_ids ?? []).filter((id) => known.has(id)),
    })),
  };
}

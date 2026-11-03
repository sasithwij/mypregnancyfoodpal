// Offline text search over the rules file. Runs on the phone, no network.

export function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents: pâté -> pate
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word))
    .join(" ");
}

function containsWords(haystack, needle) {
  return ` ${haystack} `.includes(` ${needle} `);
}

// Builds the searchable phrases for every rule once.
export function buildIndex(rules) {
  return rules.map((rule) => {
    const phrases = new Set();
    for (const text of [rule.name, ...(rule.examples ?? []), ...(rule.match_terms ?? [])]) {
      const n = normalize(text);
      if (n) phrases.add(n);
    }
    return { rule, phrases: [...phrases] };
  });
}

function scorePhrase(query, phrase) {
  if (phrase === query) return 100 + phrase.length;
  // The typed text mentions this food, e.g. "smoked salmon bagel" contains "smoked salmon".
  if (containsWords(query, phrase)) return 60 + phrase.length;
  if (query.length >= 3) {
    // The typed text is part of a known food, e.g. "brie" in "baked brie".
    if (containsWords(phrase, query)) return 40;
    // Still typing, e.g. "camem" for "camembert".
    if (phrase.split(" ").some((w) => w.startsWith(query))) return 25;
  }
  return 0;
}

export function search(index, rawQuery, limit = 8) {
  const query = normalize(rawQuery);
  if (!query) return [];

  const hits = [];
  for (const { rule, phrases } of index) {
    let best = 0;
    let bestPhrase = "";
    for (const phrase of phrases) {
      const score = scorePhrase(query, phrase);
      if (score > best) {
        best = score;
        bestPhrase = phrase;
      }
    }
    if (best > 0) hits.push({ rule, score: best, phrase: bestPhrase });
  }

  // Drop a general match when a more specific one covers it:
  // "smoked salmon" should not also show the plain "salmon" rule.
  const filtered = hits.filter(
    (hit) =>
      !hits.some(
        (other) =>
          other !== hit &&
          other.phrase !== hit.phrase &&
          other.score >= 60 &&
          containsWords(other.phrase, hit.phrase),
      ),
  );

  const severity = { red: 0, amber: 1, green: 2 };
  filtered.sort(
    (a, b) => b.score - a.score || severity[a.rule.rating] - severity[b.rule.rating],
  );
  return filtered.slice(0, limit).map((hit) => hit.rule);
}

# MyPregnancyFoodPal

A phone app that tells you whether a food is safe to eat during pregnancy, and explains why. Think MyFitnessPal, but for pregnancy food safety.

## What it does

- **Scan a barcode** on groceries and check the ingredients.
- **Take a photo of a meal** and get a safety rating.
- **Take a photo of a restaurant menu** and see which dishes are safe, plus what to ask the restaurant to change or remove (for example "cooked right through" or "no soft cheese").
- **Explain every answer** in plain words, with the guide it came from.

## Ratings

| Rating | Meaning |
|---|---|
| 🔴 **Red** | Avoid. |
| 🟠 **Amber** | Safe with caveats (for example "only if steaming hot"). |
| 🟢 **Green** | Fine to eat. |

Some Amber items carry a prominent **warning** (`"warning": true` in the rules). These are foods where the two guides disagree, and the item is only OK under strict conditions. The app shows these as a bold "Not OK unless..." message, not a footnote.

## Source of truth

All rules come only from two Australian guides:

1. **NSW Food Authority, _Food Safety During Pregnancy_** (brochure FA432/2304, 2023). The uploaded file is named `Pregnancy_brochure_21_0.pdf`.
2. **The Royal Women's Hospital (Victoria), _Food safety in pregnancy_ fact sheet** (March 2026). The uploaded file is named `Food_safety_in_pregnancy_260316.pdf`.

Each rule cites the guide and page number it comes from.

### When the guides disagree

The stricter guide wins. But where the more lenient guide allows a food under specific conditions, the app shows it as **Amber with a warning** instead of Red. Examples (decided 2 Nov 2026):

- **Whole rockmelon:** not OK unless bought whole, skin washed, cut at home and eaten fresh. Pre-cut rockmelon stays Red.
- **Sushi with cooked fillings:** not OK unless made to order with only cooked fillings and eaten straight away. Display, sushi-train and supermarket sushi stays Red. Raw or smoked seafood sushi is Red in both guides.

All conflicts and how they were resolved are listed in the `conflicts` section of the rules file.

## Rules file

[`data/pregnancy_food_rules.json`](data/pregnancy_food_rules.json) holds 62 rules (25 Red, 24 Amber, 13 Green). Each rule has:

- `name`, `category`, `examples`
- `match_terms`: words to match against barcode ingredients, menu text and photo labels
- `rating`, `caveat`, `safe_if`, `warning`
- `reason`: why, in plain words
- `hazards`: listeria, salmonella, toxoplasmosis, mercury, vitamin A, alcohol, caffeine, general food poisoning
- `ask_restaurant`: what to ask when ordering
- `sources`: guide and page number

The file also has hazard explanations, food handling tips and nutrition notes (folate, iron, calcium, iodine, omega-3).

## Who it's for

- First user: Sas's wife, on **iPhone**.
- Sas uses **Android**.
- So the app must work on both. The first version should install without going through the app stores.
- Monetisation comes later.

## Plan

1. ✅ **Rules list** built from the two guides (done, 2 Nov 2026).
2. 🟡 **Phone app** with a text search and an AI photo / menu check, installable without an app store (built, being deployed).
3. ⬜ **Barcode scanning** using [Open Food Facts](https://world.openfoodfacts.org/).
4. ⬜ **Test with the first user**, then plan a bigger version.

## The app

A web app that installs from the browser (no app store): Safari on iPhone, Chrome on Android.

- **Type a food:** searches the rules on the phone, works offline.
- **Snap a dish, menu or label:** the photo goes to `api/check.js`, a Vercel serverless function that asks Claude to rate each item against the rules and say what to ask the kitchen to change. The AI key stays on the server.

| Path | What it is |
|---|---|
| `public/` | The app (HTML, CSS, JS, icons, manifest). `rules.json` and `sw.js` are generated at build time. |
| `public/search.js` | Offline text search. |
| `api/check.js` | AI photo and text check. |
| `lib/prompt.js` | Instructions and answer format for the AI. |
| `scripts/build.mjs` | Copies the rules into `public/` and writes the offline cache. |
| `scripts/dev.mjs` | Local test server. |

### Settings (Vercel environment variables)

- `ANTHROPIC_API_KEY` (required): key from console.anthropic.com.
- `APP_PASSCODE` (optional, recommended): if set, photo checks ask for this passcode once, so strangers who find the link can't spend your AI credit.

### Running it on a computer

```
npm install
npm test
ANTHROPIC_API_KEY=... npm run dev     # or MOCK_AI=1 npm run dev for fake AI answers
```

Then open http://localhost:3000.

## Disclaimer

General information only, based on the two listed guides. It is not medical advice. For advice specific to you, talk to your doctor, midwife or obstetrician.

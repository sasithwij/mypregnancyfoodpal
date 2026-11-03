import { buildIndex, search } from "./search.js";

const RATING_LABEL = { red: "Avoid", amber: "Caution", green: "OK", unknown: "Not sure" };
const SOURCE_NAME = { nsw: "NSW Food Authority", rwh: "Royal Women's Hospital" };
const MAX_PHOTO_SIDE = 1568;

const state = { rulesFile: null, index: [], rulesById: new Map() };

// ---------- small DOM helper (text only, never innerHTML) ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    return null;
  }
  return null;
}

// ---------- icons (from the sprite in index.html) ----------
const SVG_NS = "http://www.w3.org/2000/svg";
const RATING_ICON = { red: "avoid", amber: "caution", green: "ok", unknown: "unknown" };

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "i");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

// ---------- rule cards ----------
function resultHead(rating, name) {
  const key = RATING_LABEL[rating] ? rating : "unknown";
  return el(
    "div",
    { class: "result-head" },
    el("div", { class: "rating-icon" }, icon(RATING_ICON[key])),
    el("div", {}, el("div", { class: "rating-label" }, RATING_LABEL[key]), el("div", { class: "result-name" }, name)),
  );
}

function warningBox(text) {
  return el("div", { class: "warning", role: "note" }, icon("caution"), el("div", {}, text));
}

function askBox(text) {
  return el("div", { class: "ask" }, icon("chat"), el("div", {}, text));
}

function summaryRow(text) {
  return el("summary", {}, text, icon("chevron"));
}

function limitText(limit) {
  if (!limit) return null;
  const amount = `${limit.amount} ${limit.unit}`;
  const serve = limit.serve_size_g ? ` (a serve is ${limit.serve_size_g} g)` : "";
  return `Limit: up to ${amount} a ${limit.per}${serve}.`;
}

function sourcesList(rule) {
  const hazards = (rule.hazards ?? [])
    .map((h) => state.rulesFile.hazards?.[h])
    .filter(Boolean);
  return el(
    "details",
    { class: "details" },
    summaryRow("Where this comes from"),
    el(
      "ul",
      {},
      (rule.sources ?? []).map((s) =>
        el("li", {}, `${SOURCE_NAME[s.doc] ?? s.doc}, page ${s.page}: "${s.says}"`),
      ),
    ),
    hazards.length ? el("ul", {}, hazards.map((h) => el("li", {}, h))) : null,
  );
}

function ruleCard(rule) {
  const isWarning = rule.warning === true;
  return el(
    "article",
    { class: `result ${rule.rating}` },
    resultHead(rule.rating, rule.name),
    isWarning && rule.caveat ? warningBox(rule.caveat) : null,
    !isWarning && rule.caveat ? el("p", {}, el("span", { class: "label" }, "Only if: "), rule.caveat) : null,
    rule.safe_if ? el("p", {}, el("span", { class: "label" }, "Safe if: "), rule.safe_if) : null,
    el("p", {}, el("span", { class: "label" }, "Why: "), rule.reason),
    limitText(rule.limit) ? el("p", {}, limitText(rule.limit)) : null,
    rule.ask_restaurant ? askBox(rule.ask_restaurant) : null,
    sourcesList(rule),
  );
}

// ---------- AI result cards ----------
function aiItemCard(item) {
  const rules = item.rule_ids.map((id) => state.rulesById.get(id)).filter(Boolean);
  const warnings = rules.filter((r) => r.warning && r.caveat);
  return el(
    "article",
    { class: `result ${item.rating}` },
    resultHead(item.rating, item.name),
    warnings.map((r) => warningBox(r.caveat)),
    el("p", {}, item.explanation),
    item.ask_kitchen ? askBox(item.ask_kitchen) : null,
    item.confidence === "low"
      ? el("p", { class: "ai-note" }, "The AI isn't sure about this one. Check with the staff.")
      : null,
    rules.length
      ? el(
          "details",
          { class: "details" },
          summaryRow("Rules used"),
          el(
            "ul",
            {},
            rules.map((r) =>
              el(
                "li",
                {},
                `${RATING_LABEL[r.rating]}: ${r.name}. ${r.reason} (`,
                (r.sources ?? []).map((s) => `${SOURCE_NAME[s.doc] ?? s.doc} p${s.page}`).join("; "),
                ")",
              ),
            ),
          ),
        )
      : null,
  );
}

function renderAiResult(target, result) {
  const order = { red: 0, amber: 1, unknown: 2, green: 3 };
  const items = result.kind === "menu" ? result.items : [...result.items].sort((a, b) => order[a.rating] - order[b.rating]);
  target.replaceChildren(
    result.summary ? el("p", { class: "summary" }, result.summary) : null,
    items.length ? el("div", { class: "results" }, items.map(aiItemCard)) : null,
    el("p", { class: "ai-note" }, "Checked by AI against the guides. AI can misread photos, so if anything looks wrong, ask the staff."),
  );
}

function renderLoading(target, text) {
  target.replaceChildren(el("div", { class: "loading" }, el("div", { class: "spinner" }), text));
}

function renderError(target, text, retry) {
  target.replaceChildren(
    el("div", { class: "error" }, text),
    retry ? el("div", { class: "ask-ai" }, el("button", { class: "btn btn-soft btn-small", type: "button", onclick: retry }, "Try again")) : null,
  );
}

function renderPasscode(target, retry) {
  const input = el("input", {
    type: "password",
    id: "passcode",
    class: "passcode-input",
    autocomplete: "current-password",
    placeholder: "Passcode",
    "aria-label": "App passcode",
  });
  const save = () => {
    storage("passcode", input.value.trim());
    retry();
  };
  target.replaceChildren(
    el("p", { class: "summary" }, "Photo checks need the app passcode. Enter it once and the app remembers it."),
    el("div", { class: "ask-ai" }, input, el("button", { class: "btn btn-primary btn-small", type: "button", onclick: save }, "Save")),
  );
  input.focus();
}

// ---------- AI request ----------
async function askAi(target, payload, loadingText) {
  const retry = () => askAi(target, payload, loadingText);
  renderLoading(target, loadingText);
  if (!navigator.onLine) {
    renderError(target, "You're offline. Typed searches still work, but photo checks need the internet.", retry);
    return;
  }
  try {
    const response = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Passcode": storage("passcode") ?? "" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && data.error === "passcode") return renderPasscode(target, retry);
    if (!response.ok) return renderError(target, data.error ?? "Something went wrong. Please try again.", retry);
    renderAiResult(target, data);
  } catch {
    renderError(target, "Couldn't reach the app's server. Check your internet and try again.", retry);
  }
}

// ---------- typed search ----------
function setupSearch() {
  const input = document.getElementById("search");
  const clear = document.getElementById("clear-search");
  const results = document.getElementById("search-results");
  let timer;

  const run = () => {
    const query = input.value.trim();
    clear.hidden = !query;
    if (!query) return results.replaceChildren();
    document.getElementById("photo-results").replaceChildren();
    const hits = search(state.index, query);
    const aiButton = el(
      "button",
      {
        class: "btn btn-soft btn-small",
        type: "button",
        onclick: () => askAi(results, { text: query }, `Asking AI about "${query}"…`),
      },
      icon("sparkle"),
      hits.length ? "Not quite it? Ask AI" : "Ask AI about this",
    );
    results.replaceChildren(
      hits.length
        ? el("div", { class: "results" }, hits.map(ruleCard))
        : el("p", { class: "empty" }, `"${query}" isn't in the guides' list by that name. Try another word, or ask AI to check it against the rules.`),
      el("div", { class: "ask-ai" }, aiButton),
    );
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(run, 150);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur(); // hide the keyboard so results are visible
      run();
    }
  });
  clear.addEventListener("click", () => {
    input.value = "";
    run();
    input.focus();
  });
}

// ---------- photos ----------
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not open that photo."));
      image.src = url;
    });
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { dataUrl, data: dataUrl.split(",")[1], media_type: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function setupPhotos() {
  const results = document.getElementById("photo-results");
  const camera = document.getElementById("camera-input");
  const gallery = document.getElementById("gallery-input");
  document.getElementById("camera-btn").addEventListener("click", () => {
    camera.value = "";
    camera.click();
  });
  document.getElementById("gallery-btn").addEventListener("click", () => {
    gallery.value = "";
    gallery.click();
  });

  const onPhoto = async (input) => {
    const file = input.files?.[0];
    if (!file) return;
    let photo;
    try {
      photo = await shrinkPhoto(file);
    } catch (error) {
      return renderError(results, error.message);
    }
    const search = document.getElementById("search");
    search.value = "";
    document.getElementById("clear-search").hidden = true;
    document.getElementById("search-results").replaceChildren();
    const resultBox = el("div", { class: "stack" });
    results.replaceChildren(el("img", { class: "preview", src: photo.dataUrl, alt: "Your photo" }), resultBox);
    results.scrollIntoView({ behavior: "smooth", block: "start" });
    await askAi(resultBox, { image: { data: photo.data, media_type: photo.media_type } }, "Checking your photo… a menu can take up to 30 seconds.");
  };
  camera.addEventListener("change", () => onPhoto(camera));
  gallery.addEventListener("change", () => onPhoto(gallery));
}

// ---------- install prompt ----------
function setupInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (standalone || storage("install-dismissed")) return;

  const card = document.getElementById("install-card");
  const text = document.getElementById("install-text");
  const button = document.getElementById("install-btn");
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIos) {
    text.textContent = "In Safari, tap the Share button (the square with an arrow), then tap “Add to Home Screen”. The app then opens full screen from its own icon.";
  } else {
    text.textContent = "In Chrome, tap the ⋮ menu, then “Add to Home screen” or “Install app”.";
  }
  card.hidden = false;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    button.hidden = false;
    text.textContent = "Install the app so it opens from its own icon, like any other app.";
    button.onclick = async () => {
      event.prompt();
      await event.userChoice;
      card.hidden = true;
    };
  });
  document.getElementById("install-dismiss").addEventListener("click", () => {
    storage("install-dismissed", "1");
    card.hidden = true;
  });
}

// ---------- food guide ----------
function setupGuide() {
  const list = document.getElementById("guide-list");
  const count = document.getElementById("guide-count");
  const chips = [...document.querySelectorAll("[data-filter]")];
  const show = (rating) => {
    const rules = state.rulesFile.rules
      .filter((r) => r.rating === rating)
      .sort((a, b) => a.name.localeCompare(b.name));
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === rating)));
    count.textContent = `${rules.length} foods`;
    list.replaceChildren(...rules.map(ruleCard));
  };
  chips.forEach((c) => c.addEventListener("click", () => show(c.dataset.filter)));
  show("red");
}

// ---------- tabs ----------
function setupTabs() {
  const views = [...document.querySelectorAll("[data-view]")];
  const tabs = [...document.querySelectorAll("[data-tab]")];
  const show = () => {
    const name = location.hash.slice(1);
    const current = views.some((v) => v.dataset.view === name) ? name : "check";
    views.forEach((v) => (v.hidden = v.dataset.view !== current));
    tabs.forEach((t) => (t.dataset.tab === current ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current")));
    window.scrollTo(0, 0);
  };
  window.addEventListener("hashchange", show);
  show();
}

// ---------- start ----------
async function start() {
  setupTabs();
  setupInstall();
  setupPhotos();
  try {
    const response = await fetch("rules.json");
    state.rulesFile = await response.json();
    state.index = buildIndex(state.rulesFile.rules);
    state.rulesById = new Map(state.rulesFile.rules.map((r) => [r.id, r]));
    setupSearch();
    setupGuide();
  } catch {
    renderError(document.getElementById("search-results"), "Couldn't load the food list. Check your internet and reopen the app.");
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();

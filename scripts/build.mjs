// Prepares public/ for hosting: copies the rules file in and writes the
// service worker with a version tied to the app's files, so phones update.
import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const pub = new URL("public/", root);

copyFileSync(new URL("data/pregnancy_food_rules.json", root), new URL("rules.json", pub));

const hash = createHash("sha256");
const shell = [];
for (const name of readdirSync(pub).sort()) {
  if (name === "sw.js" || name === "icons") continue;
  shell.push(`./${name}`);
  hash.update(name).update(readFileSync(new URL(name, pub)));
}
for (const name of readdirSync(new URL("icons/", pub)).sort()) {
  shell.push(`./icons/${name}`);
  hash.update(name).update(readFileSync(new URL(`icons/${name}`, pub)));
}
const version = hash.digest("hex").slice(0, 12);

const template = readFileSync(new URL("scripts/sw.template.js", root), "utf8");
writeFileSync(
  new URL("sw.js", pub),
  template
    .replace("__VERSION__", version)
    .replace("__SHELL__", JSON.stringify(["./", ...shell.filter((f) => f !== "./index.html")], null, 2)),
);
console.log(`Built app version ${version} (${shell.length} files).`);

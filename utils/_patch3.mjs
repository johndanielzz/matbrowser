import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

// Fragments must stay index-aligned with pageSpecs, so no filter(Boolean).
const oldFrag = `    let content = pageBodies.join("\\n<!--PAGE-->\\n");
    const fragments = pageBodies.map((s) => String(s || "").trim()).filter(Boolean);`;
const newFrag = `    const fragments = pageBodies.map((s) => String(s || "").trim());`;
if (!s.includes(oldFrag)) { console.error("FRAG NOT FOUND"); process.exit(1); }
s = s.replace(oldFrag, newFrag);

writeFileSync(p, s, "utf8");
console.log("ok");

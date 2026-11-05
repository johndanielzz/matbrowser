import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");
const before = s;

// 1) request() gains a per-page target list
s = s.replace(
  "const request = (maxTokens, note) => {",
  "const request = (maxTokens, note, targetSpecs = pageSpecs) => {"
);
// 2) system/user prompts describe the target pages, not always all of them
s = s.replace(
  'Output ONLY the inner content for a " + pageCount + "-page business website.',
  'Output ONLY the inner content for a " + targetSpecs.length + "-page business website.'
);
s = s.replace(
  'and emit exactly " + pageCount + " page(s) in this order: " + pageSpecs.map((p) => p.title).join(", ") + ".',
  'and emit exactly " + targetSpecs.length + " page(s) in this order: " + targetSpecs.map((p) => p.title).join(", ") + ".'
);
s = s.replace(
  'const user = "Build the " + pageCount + " page section(s) for: " + brief + ". Page focuses: " + pageSpecs.map((p) => p.title + " = " + p.focus).join("; ")',
  'const user = "Build the " + targetSpecs.length + " page section(s) for: " + brief + ". Page focuses: " + targetSpecs.map((p) => p.title + " = " + p.focus).join("; ")'
);

if (s === before) { console.error("NO CHANGE"); process.exit(1); }
writeFileSync(p, s, "utf8");
console.log("ok");

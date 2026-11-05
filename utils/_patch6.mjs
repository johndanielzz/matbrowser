import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

const start = s.indexOf("    const request = (maxTokens, note, targetSpecs = pageSpecs) => {");
const endMarker = "    // One request per page.";
const end = s.indexOf(endMarker, start);
if (start === -1 || end === -1) { console.error("ANCHORS NOT FOUND"); process.exit(1); }

const replacement = `    // Compact prompt. The Classic endpoint caps a reply at ~1500 tokens TOTAL,
    // so the previous multi-paragraph brief (long design system + full page
    // brief) left too little room for the page itself and the model stopped at
    // finish_reason "length". Keep the prompt tiny, name a fixed set of
    // sections, and let the retry ask for a shorter page.
    const request = (maxTokens, note, targetSpecs = pageSpecs, terse = false) => {
      const spec = targetSpecs[0] || {};
      const slug = String(business).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 14) || "site";
      const tone = terse ? " Write SHORT copy (max 12 words per paragraph, no extra sections)." : "";
      const system = "You are a web designer. Output ONLY the inner HTML of ONE website page. "
        + "Style: " + (terse ? String(archPick.label) + " colors " + accent + "." : designDirection + " " + layoutPick + ".") + " "
        + "Page " + (spec.title || "Home") + ": " + (spec.focus || "") + ". "
        + "Use class prefix ." + slug + "-. "
        + "Structure, in this order: (1) <style> with at most 10 one-line rules using only ." + slug + "- classes; "
        + "(2) hero: h1, one sentence, two <a> buttons; (3) stats: 4 big numbers; "
        + "(4) 3 cards, each h3 + one short line + link; (5) one <img> + short text; "
        + "(6) 3 <details> FAQ items; (7) <form> with name, email, phone, message and a submit button. "
        + "Use the image URLs given. No markdown, no explanation, no html/head/body/nav, no <!--PAGE--> marker. "
        + "Be brief so the page fits in 900 tokens. Finish every section." + tone;
      const user = terse
        ? "Business: " + brief + ". Build page \\"" + (spec.title || "Home") + "\\"."
        : "Business: " + brief + ". Build page \\"" + (spec.title || "Home") + "\\" using the image URLs exactly.";
      return this.text([{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.85, maxTokens, timeoutMs: Math.max(60000, 120000), model: process.env.POLLINATIONS_WEBSITE_MODEL || POLLINATIONS.MODELS.WEBSITE_DEFAULT, fallbackModels: POLLINATIONS.MODELS.WEBSITE_FALLBACKS });
    };
`;

s = s.slice(0, start) + replacement + s.slice(end);
writeFileSync(p, s, "utf8");
console.log("ok");

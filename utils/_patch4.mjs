import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

const start = s.indexOf("    const request = (maxTokens, note, targetSpecs = pageSpecs) => {");
const endMarker = "    // One request per page.";
const end = s.indexOf(endMarker, start);
if (start === -1 || end === -1) { console.error("ANCHORS NOT FOUND"); process.exit(1); }

const replacement = `    // Compact prompt: the Classic endpoint caps a reply at ~1500 tokens, so the
    // old multi-paragraph brief pushed the model into finish_reason "length"
    // and truncated pages mid-section. Ask for one page with a fixed,
    // compact section list instead.
    const request = (maxTokens, note, targetSpecs = pageSpecs) => {
      const spec = targetSpecs[0] || {};
      const slug = String(business).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18) || "site";
      const system = "You are MAT LEADS Studio, a top web design studio. Output ONLY the inner HTML of ONE business website page for the " + targetSpecs.length + "-page site. "
        + "DESIGN: " + designDirection + " HERO LAYOUT: " + layoutPick + " (variation #" + varietySeed + "). "
        + "SECTION PLAN for this page (" + (spec.title || "Home") + "): " + (spec.focus || "") + ". "
        + "RULES: Start with ONE <style> block of at most 14 short one-line rules using YOUR OWN prefixed class names (prefix: ." + slug + "-). "
        + "Then these sections in order: (1) hero - eyebrow, h1, one supporting sentence, TWO buttons; (2) stats row with 4 big numbers; "
        + "(3) card grid with 3 cards, each a heading, one line of copy and a small link; (4) image+text split using the hero image URL; "
        + "(5) FAQ with exactly 3 <details>/<summary> items; (6) contact form with name, email, phone, message inputs and a submit button. "
        + "Use the given image URLs in real <img src> tags with alt text and loading=lazy. "
        + "No markdown fences, no explanations, no doctype/html/head/body/nav, no <!--PAGE--> marker. "
        + "Be concise so the whole page fits in 1300 tokens, and finish every section completely.";
      const user = "Business: " + brief + ". Build the page \\"" + (spec.title || "Home") + "\\" for this business. Use the image URLs exactly."
        + (note ? " " + note : "");
      return this.text([{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.85, maxTokens, timeoutMs: Math.max(60000, 120000), model: process.env.POLLINATIONS_WEBSITE_MODEL || POLLINATIONS.MODELS.WEBSITE_DEFAULT, fallbackModels: POLLINATIONS.MODELS.WEBSITE_FALLBACKS });
    };
`;

s = s.slice(0, start) + replacement + s.slice(end);
writeFileSync(p, s, "utf8");
console.log("ok");

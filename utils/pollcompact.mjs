import { readFileSync, writeFileSync } from "node:fs";
const envText = readFileSync(".env", "utf8");
const g = (n) => (envText.match(new RegExp("^" + n + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");
const PKEY = g("POLLINATIONS_API_KEY");
const out = process.argv[2] || "logs/_compact.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { "Content-Type": "application/json", Authorization: "Bearer " + PKEY };

const qz = (c) => {
  const t = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
  const open = (c.match(/<(section|div|form|details)\b/gi) || []).length;
  const close = (c.match(/<\/(section|div|form|details)>/gi) || []).length;
  return "w=" + String(t.split(/\s+/).filter(Boolean).length).padEnd(5) +
    "style=" + (c.match(/<style/gi) || []).length + " img=" + String((c.match(/<img/gi) || []).length).padEnd(3) +
    "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) + " form=" + String((c.match(/<form/gi) || []).length).padEnd(3) +
    "sec=" + String((c.match(/<section/gi) || []).length).padEnd(3) + " bal=" + (open - close) +
    " fence=" + (c.match(/```/g) || []).length + " PAGE=" + (c.match(/<!--PAGE-->/gi) || []).length;
};

async function post(body, timeout = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const s = Date.now();
  try {
    const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: H, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    const m = j?.choices?.[0]?.message || {};
    return { status: r.status, ms: Date.now() - s, content: m.content || "", fr: j?.choices?.[0]?.finish_reason || "", usage: j?.usage || {}, raw: txt };
  } catch (e) { return { status: 0, ms: Date.now() - s, content: "", fr: "ERR:" + e.name, usage: {}, raw: String(e.message) }; }
  finally { clearTimeout(t); }
}

const nonce = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// COMPACT system prompt: tight style budget, exactly 6 sections, no PAGE marker.
const SYS_COMPACT = "You are MAT LEADS Studio, a top web design studio. Output ONLY the inner HTML of ONE business website page. Start with ONE <style> block: at most 12 short rules, each on one line, using YOUR OWN prefixed class names (prefix them with the business slug). Then exactly these 6 sections in order: (1) hero with eyebrow, h1, one sentence, TWO buttons; (2) stats row with 4 big numbers; (3) services grid with 3 cards, each a heading, one line, and a small link; (4) image+text split using the hero image URL; (5) FAQ with exactly 3 <details>/<summary> items; (6) contact form with name, email, phone, message inputs and a submit button. Use the given image URLs in real <img src> tags with alt text and loading=lazy. No markdown fences, no explanations, no doctype/html/head/body, no <!--PAGE--> marker. Be concise: the whole page must fit in 1300 tokens. Finish every section completely.";
const usr = (n, gallery) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: " + gallery[0] + ". Gallery image URL: " + gallery[1] + ". Build the 1 page for this business. Use the image URLs exactly.";

lines.push("=== COMPACT prompt x3 ===");
for (let i = 0; i < 3; i++) {
  const g = ["https://picsum.photos/seed/roofing-contractor/1600/900", "https://picsum.photos/seed/roofing-contractor-1/800/600"];
  const r = await post({ model: "openai-fast", messages: [{ role: "system", content: SYS_COMPACT }, { role: "user", content: usr(nonce(), g) }], max_tokens: 8000, temperature: 0.85, reasoning_effort: "low" });
  lines.push("#" + i + " " + (r.ms + "ms").padEnd(9) + "HTTP" + r.status + " fr=" + String(r.fr).padEnd(8) + " len=" + String(r.content.length).padEnd(6) + qz(r.content) + " usage=" + JSON.stringify(r.usage));
  if (i === 0) { lines.push("----SAMPLE----"); lines.push(r.content); lines.push("----END----"); }
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(31000);
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

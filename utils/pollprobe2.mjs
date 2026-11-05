import { readFileSync, writeFileSync } from "node:fs";
const envText = readFileSync(".env", "utf8");
const g = (n) => (envText.match(new RegExp("^" + n + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");
const PKEY = g("POLLINATIONS_API_KEY"), NKEY = g("NVIDIA_API_KEY"), NBASE = g("NVIDIA_BASE_URL").replace(/\/$/, "");
const out = process.argv[2] || "logs/_probe2.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qz = (c) => {
  const t = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  return "w=" + String(t.split(/\s+/).filter(Boolean).length).padEnd(5) +
    "style=" + (c.match(/<style/gi) || []).length +
    "img=" + String((c.match(/<img/gi) || []).length).padEnd(3) +
    "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) +
    "form=" + String((c.match(/<form/gi) || []).length).padEnd(3) +
    "picsum=" + String((c.match(/picsum/gi) || []).length).padEnd(3) +
    "fence=" + (c.match(/```/g) || []).length +
    "sections=" + String((c.match(/<section/gi) || []).length).padEnd(3) +
    "h2=" + String((c.match(/<h2/gi) || []).length).padEnd(3);
};

async function post(url, body, headers, timeout = 180000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout); const s = Date.now();
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    const m = j?.choices?.[0]?.message || {};
    return { status: r.status, id: j?.id || "-", ms: Date.now() - s, content: m.content || "", reasoning: m.reasoning || m.reasoning_content || "", fr: j?.choices?.[0]?.finish_reason || "", usage: j?.usage || {}, raw: txt };
  } catch (e) { return { status: 0, id: "-", ms: Date.now() - s, content: "", reasoning: "", fr: "ERR:" + e.name, usage: {}, raw: String(e.message) }; }
  finally { clearTimeout(t); }
}

const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of at most 25 short rules with your own prefixed class names. Then HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const usr = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";
const nonce = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- PART 1: NVIDIA ----------
lines.push("=== NVIDIA probes ===");
for (const [model, mt] of [["openai/gpt-oss-20b", 4000], ["openai/gpt-oss-20b", 8000], ["z-ai/glm-5.3-flash", 4000]]) {
  const r = await post(NBASE + "/chat/completions", { model, messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: mt, temperature: 0.8, stream: false }, { "Content-Type": "application/json", Authorization: "Bearer " + NKEY }, 90000);
  lines.push(model.padEnd(24) + "mt=" + String(mt).padEnd(6) + (r.ms + "ms").padEnd(9) + "HTTP" + String(r.status).padEnd(4) + "fr=" + String(r.fr).padEnd(8) + "len=" + String(r.content.length).padEnd(6) + "rl=" + String(r.reasoning.length).padEnd(6) + qz(r.content) + " usage=" + JSON.stringify(r.usage));
  if (r.content.length) { lines.push("----NVIDIA SAMPLE (" + model + " mt=" + mt + ")----"); lines.push(r.content.slice(0, 2500)); lines.push("----END SAMPLE----"); }
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(3000);
}

// ---------- PART 2: CLASSIC param tuning (35s apart) ----------
lines.push("");
lines.push("=== CLASSIC openai-fast param tuning ===");
const CH = { "Content-Type": "application/json", Authorization: "Bearer " + PKEY };
const variants = [
  { label: "mt=4000 plain", body: { model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 4000, temperature: 0.8 } },
  { label: "mt=8000 plain", body: { model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.8 } },
  { label: "mt=8000 effort=low", body: { model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.8, reasoning_effort: "low" } },
  { label: "mt=8000 effort=none", body: { model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.8, reasoning_effort: "none" } },
  { label: "mt=8000 clear_thinking", body: { model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.8, clear_thinking: true } },
];
for (const v of variants) {
  const r = await post("https://text.pollinations.ai/openai", v.body, CH, 200000);
  lines.push(v.label.padEnd(24) + (r.ms + "ms").padEnd(9) + "HTTP" + String(r.status).padEnd(4) + "fr=" + String(r.fr).padEnd(8) + "len=" + String(r.content.length).padEnd(6) + "rl=" + String(r.reasoning.length).padEnd(6) + qz(r.content) + " usage=" + JSON.stringify(r.usage));
  if (!r.content.length && r.raw) lines.push("   raw=" + r.raw.replace(/\s+/g, " ").slice(0, 220));
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(35000);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

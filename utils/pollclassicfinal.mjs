import { readFileSync, writeFileSync } from "node:fs";
const envText = readFileSync(".env", "utf8");
const g = (n) => (envText.match(new RegExp("^" + n + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");
const PKEY = g("POLLINATIONS_API_KEY");
const out = process.argv[2] || "logs/_classic_final.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qz = (c) => {
  const t = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  return "w=" + String(t.split(/\s+/).filter(Boolean).length).padEnd(5) +
    "style=" + (c.match(/<style/gi) || []).length +
    "img=" + String((c.match(/<img/gi) || []).length).padEnd(3) +
    "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) +
    "form=" + String((c.match(/<form/gi) || []).length).padEnd(3) +
    "pic=" + String((c.match(/picsum/gi) || []).length).padEnd(3) +
    "fence=" + (c.match(/```/g) || []).length +
    "sec=" + String((c.match(/<section/gi) || []).length).padEnd(3) +
    "h2=" + String((c.match(/<h2/gi) || []).length).padEnd(3);
};

async function post(body, timeout = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const s = Date.now();
  try {
    const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + PKEY }, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const m = j?.choices?.[0]?.message || {};
    return { status: r.status, id: j?.id || "-", ms: Date.now() - s, content: m.content || "", reasoning: m.reasoning || m.reasoning_content || "", fr: j?.choices?.[0]?.finish_reason || "", usage: j?.usage || {}, retryAfter: r.headers.get("retry-after"), raw: txt };
  } catch (e) {
    return { status: 0, id: "-", ms: Date.now() - s, content: "", reasoning: "", fr: "ERR:" + e.name, usage: {}, retryAfter: null, raw: String(e.message) };
  } finally { clearTimeout(t); }
}

const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of at most 25 short rules using your own prefixed class names. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const usr = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";
const nonce = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

lines.push("=== CLASSIC openai-fast + reasoning_effort=low : 3 fresh runs ===");
for (let i = 0; i < 3; i++) {
  const r = await post({ model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.8, reasoning_effort: "low" });
  lines.push("#" + i + " " + (r.ms + "ms").padEnd(9) + "HTTP" + String(r.status).padEnd(4) + "fr=" + String(r.fr).padEnd(8) + "len=" + String(r.content.length).padEnd(6) + "rl=" + String(r.reasoning.length).padEnd(6) + qz(r.content) + " usage=" + JSON.stringify(r.usage) + " ra=" + r.retryAfter);
  if (i === 0) { lines.push("----SAMPLE----"); lines.push(r.content); lines.push("----END SAMPLE----"); }
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(32000);
}

lines.push("");
lines.push("=== RATE LIMIT probe: two back-to-back requests (no sleep) ===");
for (let i = 0; i < 2; i++) {
  const r = await post({ model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.8, reasoning_effort: "low" });
  lines.push("burst#" + i + " " + (r.ms + "ms").padEnd(9) + "HTTP" + String(r.status).padEnd(4) + "fr=" + String(r.fr).padEnd(8) + "len=" + String(r.content.length).padEnd(6) + qz(r.content) + " ra=" + r.retryAfter + " | " + r.raw.replace(/\s+/g, " ").slice(0, 200));
  writeFileSync(out, lines.join("\n"), "utf8");
  if (i === 0) await sleep(2000);
}

lines.push("");
lines.push("=== AUTH check: no-auth on Classic ===");
{
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 120000);
  const s = Date.now();
  try {
    const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 100 }), signal: ctl.signal });
    const txt = await r.text();
    lines.push("no-auth HTTP" + r.status + " " + (Date.now() - s) + "ms :: " + txt.replace(/\s+/g, " ").slice(0, 220));
  } catch (e) { lines.push("no-auth ERR " + e.message); } finally { clearTimeout(t); }
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

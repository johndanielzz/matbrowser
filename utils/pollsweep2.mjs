import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_sweep3.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GEN = "https://gen.pollinations.ai/v1/chat/completions";
const CLASSIC = "https://text.pollinations.ai/openai";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };

async function call(base, model, body) {
  const started = Date.now();
  try {
    const r = await fetch(base, { method: "POST", headers: hdr, body: JSON.stringify({ model, ...body }) });
    const t = await r.text();
    let j = null;
    try { j = JSON.parse(t); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    const denied = /isn.t allowed to use|is not allowed to use|allow it for this key/i.test(c);
    return { status: r.status, id: j?.id || "-", ms: Date.now() - started, denied, len: c.length, reason: (m.reasoning_content || "").length, fr: j?.choices?.[0]?.finish_reason || "", content: c, raw: t };
  } catch (e) {
    return { status: 0, id: "-", ms: Date.now() - started, denied: false, len: 0, reason: 0, fr: "ERR", content: "", raw: e.message };
  }
}

const longSys = "You are a senior web designer. Output only the inner HTML content for a business website page. No doctype/html/head/body. Start with ONE <style> block using your own class names, then a HERO section, a stats row, a 4-card services grid, an image+text split, and an FAQ accordion using <details>/<summary>. Use the exact image URLs given. No markdown fences.";
const longUser = "Build 1 page for ACME Roofing in Lagos, Nigeria. Phone +2348012345678. Hero image https://picsum.photos/seed/roofing/1600/900. Gallery image https://picsum.photos/seed/roofing-1/800/600. Write complete professional copy for every section, minimum 2500 characters total, and end cleanly.";

function stat(r) {
  const words = r.content.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return (r.ms + "ms").padEnd(9) + "HTTP" + String(r.status).padEnd(5) + (r.denied ? "DENIED" : "OK").padEnd(8) +
    "id=" + String(r.id).slice(0, 12).padEnd(14) + "len=" + String(r.len).padEnd(6) + "w=" + String(words).padEnd(5) +
    "reason=" + String(r.reason).padEnd(5) + "fr=" + String(r.fr).padEnd(8) +
    "style=" + (/<style/i.test(r.content) ? "Y" : "n") + " img=" + (r.content.match(/<img/gi) || []).length + " det=" + (r.content.match(/<details/gi) || []).length;
}

const GEN_MODELS = ["z-ai/glm-5.3-flash", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "openai-fast", "gpt-oss-20b"];
lines.push("=== GEN endpoint, REAL website prompt mt=4000 ===");
for (const m of GEN_MODELS) {
  const r = await call(GEN, m, { messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85 });
  lines.push(m.padEnd(30) + stat(r));
  await sleep(3000);
}
lines.push("");

lines.push("=== CLASSIC endpoint, REAL website prompt mt=4000 ===");
for (const m of ["openai-fast", "gpt-oss-20b", "openai"]) {
  const r = await call(CLASSIC, m, { messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85 });
  lines.push(m.padEnd(30) + stat(r));
  await sleep(3000);
}
lines.push("");

lines.push("=== CLASSIC endpoint, SHORT prompt mt=300 (does it actually answer?) ===");
for (const m of ["openai-fast", "gpt-oss-20b"]) {
  const r = await call(CLASSIC, m, { messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 300 });
  lines.push(m.padEnd(30) + stat(r) + " | " + r.content.slice(0, 50).replace(/\n/g, " "));
  await sleep(3000);
}
lines.push("");

lines.push("=== CLASSIC no-auth (anonymous) ===");
{
  const r = await fetch(CLASSIC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 300 }) });
  const t = await r.text();
  lines.push("HTTP " + r.status + " :: " + t.slice(0, 300));
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);


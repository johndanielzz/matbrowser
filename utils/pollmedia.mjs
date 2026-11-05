import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_classic.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLASSIC = "https://text.pollinations.ai/openai";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };

async function call(body, useAuth = true) {
  const started = Date.now();
  const r = await fetch(CLASSIC, { method: "POST", headers: useAuth ? hdr : { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  const m = (j?.choices?.[0]?.message) || {};
  const c = m.content || "";
  return { status: r.status, id: j?.id || "-", ms: Date.now() - started, len: c.length, fr: j?.choices?.[0]?.finish_reason || "", content: c, raw: t, usage: j?.usage || {} };
}

function quality(c) {
  const text = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return {
    words,
    style: (c.match(/<style/gi) || []).length,
    img: (c.match(/<img/gi) || []).length,
    details: (c.match(/<details/gi) || []).length,
    sections: (c.match(/<section/gi) || []).length,
    h2: (c.match(/<h2/gi) || []).length,
    form: (c.match(/<form/gi) || []).length,
    picsum: (c.match(/picsum\.photos/gi) || []).length,
    fence: (c.match(/```/g) || []).length,
  };
}

// Tight prompt: budget CSS hard so the model spends tokens on content.
const tightSys = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of AT MOST 25 short rules using your own class names (prefix them, e.g. .rf-hero). Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Use the exact image URLs given in <img src> tags with alt text. No markdown fences. Be concise but complete.";
const tightUser = "Business: ACME Roofing, Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page. Use the image URLs exactly as given. End cleanly with </section>.";

lines.push("=== CLASSIC max_tokens sweep (tight prompt) ===");
for (const mt of [2000, 4000, 8000, 16000, 32000]) {
  const r = await call({ model: "openai-fast", messages: [{ role: "system", content: tightSys }, { role: "user", content: tightUser }], max_tokens: mt, temperature: 0.8 });
  const q = quality(r.content);
  lines.push("mt=" + String(mt).padEnd(6) + (r.ms + "ms").padEnd(9) + "HTTP" + r.status + " fr=" + String(r.fr).padEnd(8) + "len=" + String(r.len).padEnd(6) +
    "w=" + String(q.words).padEnd(5) + "style=" + q.style + " img=" + String(q.img).padEnd(3) + "det=" + String(q.details).padEnd(3) + "sec=" + String(q.sections).padEnd(3) + "h2=" + String(q.h2).padEnd(3) + "form=" + q.form + " picsum=" + q.picsum + " fence=" + q.fence + " usage=" + JSON.stringify(r.usage));
  await sleep(3000);
}
lines.push("");

lines.push("=== CLASSIC auth vs no-auth (same request) ===");
{
  const a = await call({ model: "openai-fast", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 100 }, true);
  const b = await call({ model: "openai-fast", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 100 }, false);
  lines.push("with-key   HTTP" + a.status + " len=" + a.len + " fr=" + a.fr + " | " + a.content.slice(0, 30).replace(/\n/g, " "));
  lines.push("no-key     HTTP" + b.status + " len=" + b.len + " fr=" + b.fr + " | " + b.content.slice(0, 30).replace(/\n/g, " "));
  await sleep(2000);
}
lines.push("");

lines.push("=== CLASSIC full prompt dump (mt=16000) ===");
{
  const r = await call({ model: "openai-fast", messages: [{ role: "system", content: tightSys }, { role: "user", content: tightUser }], max_tokens: 16000, temperature: 0.8 });
  lines.push("HTTP" + r.status + " " + r.ms + "ms len=" + r.len + " fr=" + r.fr);
  lines.push("----BEGIN----");
  lines.push(r.content);
  lines.push("----END----");
  lines.push("");
  lines.push("RAW HEAD: " + r.raw.slice(0, 600));
}
lines.push("");

lines.push("=== IMAGE hosts (legacy free) ===");
const imgUrls = [
  "https://image.pollinations.ai/prompt/a%20red%20fox?width=512&height=512&nologo=true",
  "https://image.pollinations.ai/prompt/a%20red%20fox?width=512&height=512&nologo=true&key=" + key,
  "https://gen.pollinations.ai/image/a%20red%20fox?width=512&height=512&nologo=true&model=flux&key=" + key,
  "https://image.pollinations.ai/prompt/rooftop%20roofing%20company%20van?width=1024&height=512&nologo=true&seed=42"
];
for (const u of imgUrls) {
  const started = Date.now();
  try {
    const r = await fetch(u, { headers: { Authorization: "Bearer " + key } });
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) lines.push(u.slice(0, 70).padEnd(72) + "HTTP " + r.status + " JSON " + (await r.text()).slice(0, 200));
    else { const b = await r.arrayBuffer(); lines.push(u.slice(0, 70).padEnd(72) + "HTTP " + r.status + " bytes=" + b.byteLength + " ct=" + ct); }
  } catch (e) { lines.push(u.slice(0, 70).padEnd(72) + "ERR " + e.message); }
  await sleep(2500);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);


import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_diag.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GEN = "https://gen.pollinations.ai/v1/chat/completions";
const CLASSIC = "https://text.pollinations.ai/openai";

async function post(url, body, { auth = true, timeout = 200000 } = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth && key) headers.Authorization = "Bearer " + key;
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    const t2 = await r.text();
    let j = null;
    try { j = JSON.parse(t2); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    return { status: r.status, ms: Date.now() - started, id: j?.id || "-", len: (m.content || "").length, fr: j?.choices?.[0]?.finish_reason || "", content: m.content || "", raw: t2, usage: j?.usage || {} };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, id: "-", len: 0, fr: "ERR:" + e.name, content: "", raw: String(e.message), usage: {} };
  } finally { clearTimeout(t); }
}

const P = "Reply with exactly: OK";
const tag = (r) => (r.status + "ms" ).padEnd(0) + "HTTP" + String(r.status).padEnd(4) + (r.ms + "ms").padEnd(9) + "id=" + String(r.id).slice(0, 14).padEnd(16) + "len=" + String(r.len).padEnd(5) + "fr=" + String(r.fr).padEnd(8);

lines.push("=== GEN: identical tiny prompt x6, WITH key ===");
for (let i = 0; i < 6; i++) {
  const r = await post(GEN, { model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: P }], max_tokens: 200 });
  const denied = /isn.t allowed to use/i.test(r.content);
  lines.push("#" + i + " " + tag(r) + (denied ? "DENIED" : "OK").padEnd(8) + "usage=" + JSON.stringify(r.usage));
  await sleep(2000);
}
lines.push("");

lines.push("=== GEN: identical tiny prompt x3, NO key ===");
for (let i = 0; i < 3; i++) {
  const r = await post(GEN, { model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: P }], max_tokens: 200 }, { auth: false });
  const denied = /isn.t allowed to use/i.test(r.content);
  lines.push("#" + i + " " + tag(r) + (denied ? "DENIED" : "OK").padEnd(8) + " | " + r.content.slice(0, 60).replace(/\n/g, " "));
  await sleep(2000);
}
lines.push("");

lines.push("=== CLASSIC: tiny prompt WITH key ===");
{
  const r = await post(CLASSIC, { model: "openai-fast", messages: [{ role: "user", content: P }], max_tokens: 200 });
  lines.push(tag(r) + "usage=" + JSON.stringify(r.usage));
  lines.push("RAW: " + r.raw.slice(0, 400));
}
lines.push("");

lines.push("=== CLASSIC: tiny prompt NO key ===");
{
  const r = await post(CLASSIC, { model: "openai-fast", messages: [{ role: "user", content: P }], max_tokens: 200 }, { auth: false });
  lines.push(tag(r) + "usage=" + JSON.stringify(r.usage));
  lines.push("RAW: " + r.raw.slice(0, 400));
}

lines.push("=== CLASSIC: big website prompt NO key, mt=4000 ===");
{
  const sys = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of AT MOST 25 short rules using your own prefixed class names. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
  const usr = "Business: ACME Roofing, Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";
  const r = await post(CLASSIC, { model: "openai-fast", messages: [{ role: "system", content: sys }, { role: "user", content: usr }], max_tokens: 4000, temperature: 0.8 }, { auth: false });
  const c = r.content;
  const words = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  lines.push(tag(r) + "words=" + words + " style=" + (c.match(/<style/gi) || []).length + " img=" + (c.match(/<img/gi) || []).length + " det=" + (c.match(/<details/gi) || []).length + " picsum=" + (c.match(/picsum/gi) || []).length + " usage=" + JSON.stringify(r.usage));
  lines.push("----BEGIN----");
  lines.push(c);
  lines.push("----END----");
}
lines.push("");

lines.push("=== IMAGE: image.pollinations.ai anonymous ===");
for (const u of [
  "https://image.pollinations.ai/prompt/blue%20bird?width=512&height=512&nologo=true",
  "https://image.pollinations.ai/prompt/green%20tree?width=512&height=512&nologo=true&seed=7"
]) {
  const started = Date.now();
  try {
    const ctl = new AbortController();
    const tt = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch(u, { signal: ctl.signal });
    clearTimeout(tt);
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) lines.push(u.slice(0, 60).padEnd(62) + "HTTP " + r.status + " " + (await r.text()).slice(0, 200).replace(/\n/g, " "));
    else { const b = await r.arrayBuffer(); lines.push(u.slice(0, 60).padEnd(62) + "HTTP " + r.status + " bytes=" + b.byteLength + " ct=" + ct + " " + (Date.now() - started) + "ms"); }
  } catch (e) { lines.push(u.slice(0, 60).padEnd(62) + "ERR " + e.message); }
  await sleep(46000);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

lines.push("");


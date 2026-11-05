import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_classic2.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CLASSIC = "https://text.pollinations.ai/openai";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };

async function call(body, { auth = true, timeout = 240000 } = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(CLASSIC, { method: "POST", headers: auth ? hdr : { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const t2 = await r.text();
    let j = null;
    try { j = JSON.parse(t2); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    return { status: r.status, id: j?.id || "-", ms: Date.now() - started, len: c.length, fr: j?.choices?.[0]?.finish_reason || "", content: c, raw: t2, usage: j?.usage || {}, reason: m.reasoning || m.reasoning_content || "" };
  } catch (e) {
    return { status: 0, id: "-", ms: Date.now() - started, len: 0, fr: "ERR:" + e.name, content: "", raw: String(e.message), usage: {}, reason: "" };
  } finally { clearTimeout(t); }
}

function quality(c) {
  const text = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    style: (c.match(/<style/gi) || []).length,
    img: (c.match(/<img/gi) || []).length,
    details: (c.match(/<details/gi) || []).length,
    sections: (c.match(/<section/gi) || []).length,
    h2: (c.match(/<h2/gi) || []).length,
    form: (c.match(/<form/gi) || []).length,
    picsum: (c.match(/picsum\.photos/gi) || []).length,
    fence: (c.match(/```/g) || []).length,
    styleChars: (c.match(/<style[\s\S]*?<\/style>/gi) || []).join("").length,
  };
}


const tightSys = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of AT MOST 25 short rules using your own prefixed class names. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const tightUser = "Business: ACME Roofing, Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";

lines.push("=== CLASSIC max_tokens sweep (tight prompt), generous timeout ===");
for (const mt of [4000, 12000]) {
  const r = await call({ model: "openai-fast", messages: [{ role: "system", content: tightSys }, { role: "user", content: tightUser }], max_tokens: mt, temperature: 0.8 });
  const q = quality(r.content);
  lines.push("mt=" + String(mt).padEnd(6) + (r.ms + "ms").padEnd(9) + "HTTP" + r.status + " fr=" + String(r.fr).padEnd(9) + "len=" + String(r.len).padEnd(6) +
    "w=" + String(q.words).padEnd(5) + "style=" + q.style + "(" + q.styleChars + "ch) img=" + String(q.img).padEnd(3) + "det=" + String(q.details).padEnd(3) + "sec=" + String(q.sections).padEnd(3) + "h2=" + String(q.h2).padEnd(3) + "form=" + q.form + " picsum=" + q.picsum + " fence=" + q.fence + " usage=" + JSON.stringify(r.usage));
  if (mt === 12000) {
    lines.push("----BEGIN 12000----");
    lines.push(r.content);
    lines.push("----END 12000----");
  }
  await sleep(2000);
}
lines.push("");

lines.push("=== CLASSIC extra param support ===");
{
  const r = await call({ model: "openai-fast", messages: [{ role: "system", content: "You only answer in one word." }, { role: "user", content: "Say OK" }], max_tokens: 100, reasoning_effort: "low" });
  lines.push("reasoning_effort HTTP" + r.status + " len=" + r.len + " fr=" + r.fr + " | " + r.content.slice(0, 40).replace(/\n/g, " ") + " | reason=" + String(r.reason).slice(0, 60));
  await sleep(2000);
}
{
  const r = await call({ model: "openai-fast", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 100, max_completion_tokens: 100 });
  lines.push("max_completion_tokens HTTP" + r.status + " len=" + r.len + " fr=" + r.fr + " | " + r.content.slice(0, 40).replace(/\n/g, " "));
  await sleep(2000);
}
lines.push("");

lines.push("=== CLASSIC stability: 3x same website prompt ===");
for (let i = 0; i < 3; i++) {
  const r = await call({ model: "openai-fast", messages: [{ role: "system", content: tightSys }, { role: "user", content: tightUser }], max_tokens: 12000, temperature: 0.8 });
  const q = quality(r.content);
  lines.push("#" + i + " " + (r.ms + "ms").padEnd(9) + "HTTP" + r.status + " fr=" + String(r.fr).padEnd(9) + "len=" + String(r.len).padEnd(6) + "w=" + String(q.words).padEnd(5) + "img=" + String(q.img).padEnd(3) + "det=" + String(q.details).padEnd(3) + "form=" + q.form + " picsum=" + q.picsum);
  await sleep(2000);
}
lines.push("");
lines.push("=== IMAGE hosts ===");
const imgUrls = [
  "https://image.pollinations.ai/prompt/a%20red%20fox?width=512&height=512&nologo=true",
  "https://image.pollinations.ai/prompt/a%20red%20fox?width=512&height=512&nologo=true&key=" + key,
  "https://image.pollinations.ai/prompt/a%20red%20fox?width=512&height=512&nologo=true&model=flux&key=" + key,
  "https://gen.pollinations.ai/image/a%20red%20fox?width=512&height=512&nologo=true&model=flux&key=" + key,
  "https://gen.pollinations.ai/image/a%20red%20fox?width=512&height=512&nologo=true&model=flux"
];
for (const u of imgUrls) {
  const started = Date.now();
  try {
    const ctl = new AbortController();
    const tt = setTimeout(() => ctl.abort(), 60000);
    const r = await fetch(u, { headers: { Authorization: "Bearer " + key }, signal: ctl.signal });
    clearTimeout(tt);
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("json")) lines.push(u.slice(0, 78).padEnd(80) + "HTTP " + r.status + " JSON " + (await r.text()).slice(0, 220).replace(/\n/g, " "));
    else { const b = await r.arrayBuffer(); lines.push(u.slice(0, 78).padEnd(80) + "HTTP " + r.status + " bytes=" + b.byteLength + " ct=" + ct); }
  } catch (e) { lines.push(u.slice(0, 78).padEnd(80) + "ERR " + e.message); }
  await sleep(2000);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);



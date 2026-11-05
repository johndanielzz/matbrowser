import { readFileSync, writeFileSync } from "node:fs";
const envText = readFileSync(".env", "utf8");
const g = (n) => (envText.match(new RegExp("^" + n + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");
const PKEY = g("POLLINATIONS_API_KEY");
const out = process.argv[2] || "logs/_classic_cap.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const H = { "Content-Type": "application/json", Authorization: "Bearer " + PKEY };

const qz = (c) => {
  const t = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
  return "w=" + String(t.split(/\s+/).filter(Boolean).length).padEnd(5) +
    "style=" + (c.match(/<style/gi) || []).length + " img=" + String((c.match(/<img/gi) || []).length).padEnd(3) +
    "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) + " form=" + String((c.match(/<form/gi) || []).length).padEnd(3) +
    "pic=" + String((c.match(/picsum/gi) || []).length).padEnd(3) + " fence=" + (c.match(/```/g) || []).length +
    "PAGE=" + String((c.match(/<!--PAGE-->/gi) || []).length).padEnd(3) + "sec=" + String((c.match(/<section/gi) || []).length).padEnd(3);
};

async function post(url, body, headers = H, timeout = 180000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const s = Date.now();
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    const m = j?.choices?.[0]?.message || {};
    return { status: r.status, id: j?.id || "-", ms: Date.now() - s, content: m.content || "", reasoning: m.reasoning || m.reasoning_content || "", fr: j?.choices?.[0]?.finish_reason || "", usage: j?.usage || {}, ra: r.headers.get("retry-after"), raw: txt };
  } catch (e) { return { status: 0, id: "-", ms: Date.now() - s, content: "", reasoning: "", fr: "ERR:" + e.name, usage: {}, ra: null, raw: String(e.message) }; }
  finally { clearTimeout(t); }
}

const CH = "https://text.pollinations.ai/openai";
const nonce = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const base = (extra = {}) => ({ model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(nonce()) }], max_tokens: 8000, temperature: 0.85, reasoning_effort: "low", ...extra });

const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of at most 25 short rules using your own prefixed class names. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const usr = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";

// 0. balance / key state
lines.push("=== key state ===");
for (const p of ["/account/key", "/account/key/usage", "/v1/models?category=text"]) {
  try {
    const r = await fetch("https://gen.pollinations.ai" + p, { headers: { Authorization: "Bearer " + PKEY, Accept: "application/json" } });
    const t = await r.text();
    lines.push(p.padEnd(26) + "HTTP" + r.status + " :: " + t.replace(/\s+/g, " ").slice(0, 400));
  } catch (e) { lines.push(p + " ERR " + e.message); }
}
lines.push("");

// 1. param support on Classic: top_p + safe
lines.push("=== CLASSIC param support ===");
{
  const r = await post(CH, base({ top_p: 0.9 }));
  lines.push("top_p        HTTP" + r.status + " fr=" + r.fr + " len=" + r.content.length + " " + qz(r.content) + " " + r.raw.replace(/\s+/g, " ").slice(0, 150));
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(32000);
}
{
  const r = await post(CH, base({ safe: "no" }));
  lines.push("safe=no      HTTP" + r.status + " fr=" + r.fr + " len=" + r.content.length + " " + qz(r.content) + " " + r.raw.replace(/\s+/g, " ").slice(0, 150));
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(32000);
}

// 2. two pages in ONE request
lines.push("");
lines.push("=== CLASSIC 2 pages in one request ===");
{
  const SYS2 = SYS.replace("Write 1 page", "Write 2 pages");
  const body = { model: "openai-fast", messages: [{ role: "system", content: SYS2 }, { role: "user", content: usr(nonce()).replace("Write 1 page", "Write 2 pages separated by <!--PAGE-->") }], max_tokens: 8000, temperature: 0.85, reasoning_effort: "low" };
  const r = await post(CH, body);
  lines.push("2pages HTTP" + r.status + " fr=" + r.fr + " len=" + r.content.length + " rl=" + r.reasoning.length + " " + qz(r.content) + " usage=" + JSON.stringify(r.usage));
  if (r.content) { lines.push("----SAMPLE----"); lines.push(r.content.slice(0, 4000)); lines.push("----END----"); }
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(32000);
}

// 3. max_tokens effect: does a bigger cap raise the 1500 ceiling?
lines.push("");
lines.push("=== CLASSIC max_tokens ceiling (effort=low) ===");
{
  const r = await post(CH, base({ max_tokens: 16000 }));
  lines.push("mt=16000 HTTP" + r.status + " fr=" + r.fr + " len=" + r.content.length + " rl=" + r.reasoning.length + " " + qz(r.content) + " usage=" + JSON.stringify(r.usage));
  writeFileSync(out, lines.join("\n"), "utf8");
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

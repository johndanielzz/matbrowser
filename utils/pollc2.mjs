import { readFileSync, writeFileSync } from "node:fs";
const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_c2.txt";
const lines = [];
const CLASSIC = "https://text.pollinations.ai/openai";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(body, auth = true, timeout = 200000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const s = Date.now();
  try {
    const r = await fetch(CLASSIC, { method: "POST", headers: auth ? { "Content-Type": "application/json", Authorization: "Bearer " + key } : { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    const c = (j?.choices?.[0]?.message)?.content || "";
    return { status: r.status, id: j?.id || "-", ms: Date.now() - s, len: c.length, c, raw: txt.slice(0, 400), usage: j?.usage || {}, fr: j?.choices?.[0]?.finish_reason || "" };
  } catch (e) { return { status: 0, id: "-", ms: Date.now() - s, len: 0, c: "", raw: "ERR " + e.name, usage: {}, fr: "ERR" }; }
  finally { clearTimeout(t); }
}
const qz = (c) => "w=" + String(c.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").split(/\s+/).filter(Boolean).length).padEnd(5) + "style=" + (c.match(/<style/gi)||[]).length + " img=" + String((c.match(/<img/gi)||[]).length).padEnd(3) + "det=" + String((c.match(/<details/gi)||[]).length).padEnd(3) + "form=" + (c.match(/<form/gi)||[]).length + "picsum=" + (c.match(/picsum/gi)||[]).length + "fence=" + (c.match(/```/g)||[]).length;

const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page. ONE <style> block with your own prefixed classes. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row, services grid (4 cards), image+text split, FAQ with <details>/<summary>, contact form. Use the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const usr = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";

lines.push("=== CLASSIC openai-fast, UNIQUE prompts (cache-busting) ===");
for (let i = 0; i < 4; i++) {
  const n = "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const r = await call({ model: "openai-fast", messages: [{ role: "system", content: SYS }, { role: "user", content: usr(n) }], max_tokens: 4000, temperature: 0.8 });
  lines.push("#" + i + " " + (r.ms + "ms").padEnd(9) + "HTTP" + String(r.status).padEnd(4) + "fr=" + String(r.fr).padEnd(8) + "len=" + String(r.len).padEnd(6) + qz(r.c) + "  raw=" + r.raw.replace(/\s+/g, " ").slice(0, 150));
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(35000);
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

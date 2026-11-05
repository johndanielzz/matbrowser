import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_rate.txt";
const lines = [];
const GEN = "https://gen.pollinations.ai/v1/chat/completions";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body, timeout = 120000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const started = Date.now();
  try {
    const r = await fetch(GEN, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key }, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    return { status: r.status, ms: Date.now() - started, id: (j?.id || "-"), len: c.length, denied: /isn.t allowed to use|not allowed for this API key|allow it for this key/i.test(c + txt), content: c, usage: j?.usage || {}, fr: j?.choices?.[0]?.finish_reason || "" };
  } catch (e) { return { status: 0, ms: Date.now() - started, id: "-", len: 0, denied: false, content: "", usage: {}, fr: "ERR:" + e.name }; }
  finally { clearTimeout(t); }
}
const qz = (c) => {
  const w = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return "w=" + String(w).padEnd(5) + "style=" + (c.match(/<style/gi) || []).length + " img=" + String((c.match(/<img/gi) || []).length).padEnd(3) + "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) + "form=" + (c.match(/<form/gi) || []).length + "picsum=" + (c.match(/picsum/gi) || []).length + "fence=" + (c.match(/```/g) || []).length;
};

const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page. ONE <style> block with prefixed classes. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row, services grid (4 cards), image+text split, FAQ with <details>/<summary>, contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const user = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";

const N = Number(process.argv[3] || 20);
lines.push("=== Gen allow-rate: " + N + " distinct website bodies, mt=3000, glm-5.3-flash ===");
let allow = 0;
for (let i = 0; i < N; i++) {
  const nonce = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const r = await post({ model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: SYS }, { role: "user", content: user(nonce) }], max_tokens: 3000, temperature: 0.85, stream: false });
  if (!r.denied) allow++;
  lines.push("#" + String(i).padEnd(3) + "HTTP" + String(r.status).padEnd(4) + (r.denied ? "DENIED" : "ALLOW").padEnd(7) + (r.ms + "ms").padEnd(8) + "id=" + String(r.id).slice(0, 15).padEnd(17) + "len=" + String(r.len).padEnd(6) + "fr=" + String(r.fr).padEnd(8) + qz(r.content));
  writeFileSync(out, lines.join("\n"), "utf8");
  await sleep(1200);
}
lines.push("");
lines.push("ALLOWED " + allow + "/" + N);
writeFileSync(out, lines.join("\n"), "utf8");
console.log("ALLOWED " + allow + "/" + N);

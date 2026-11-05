import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_long6.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = "https://gen.pollinations.ai/v1/chat/completions";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };

const longSys = "You are MAT LEADS Studio. Output ONLY inner page content for a 1-page business website. No <!doctype>, <html>, <head>, <body>. Open with ONE <style> block defining your own classes, then a HERO (eyebrow, headline, sentence, two buttons), a stats row, a 4-card services grid, an image+text split, an FAQ accordion with <details>/<summary>, and a closing CTA band. Use the exact image URLs given. No markdown, no explanations, no code fences.";
const longUser = "Build 1 page section for: ACME Roofing, a roofing company in Lagos, Nigeria. Phone +2348012345678. Address 12 Harbour Road, Lagos. Hero image https://picsum.photos/seed/roofing/1600/900. Gallery https://picsum.photos/seed/roofing-1/800/600 and https://picsum.photos/seed/roofing-2/800/600. Every section complete, minimum 2500 characters of body content. End cleanly.";

async function call(label, body) {
  const started = Date.now();
  const r = await fetch(base, { method: "POST", headers: hdr, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  const c = j?.choices?.[0]?.message?.content || "";
  const rc = j?.choices?.[0]?.message?.reasoning_content || "";
  const fr = j?.choices?.[0]?.finish_reason || "";
  const denied = /isn.t allowed to use|is not allowed to use/i.test(c);
  const words = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  lines.push(label.padEnd(34) + "HTTP " + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(9) +
    " fr=" + String(fr).padEnd(8) + " content=" + String(c.length).padEnd(6) + " reason=" + String(rc.length).padEnd(6) +
    " words=" + String(words).padEnd(5) + " style=" + (/<style/i.test(c) ? "Y" : "n") + " img=" + (c.match(/<img/gi) || []).length +
    " det=" + (c.match(/<details/gi) || []).length + (denied ? "  <<DENIED>>" : ""));
  if (denied) lines.push("   DENIED-RAW: " + c.slice(0, 200));
  if (c && !denied && c.length > 400) {
    lines.push("   --- content ---");
    lines.push(c);
    lines.push("   --- end ---");
  }
  return c;
}

// A: long generation with clear_thinking + generous tokens
await call("A long clear_thinking 4000", { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85, chat_template_kwargs: { clear_thinking: true } });
await sleep(4000);

// B: same again to check repeatability
await call("B long clear_thinking 4000", { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85, chat_template_kwargs: { clear_thinking: true } });
await sleep(4000);

// C: no clear_thinking for comparison
await call("C long plain 4000", { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85 });

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

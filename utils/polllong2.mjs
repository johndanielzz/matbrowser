import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_long2.txt";
const lines = [];

const base = "https://gen.pollinations.ai/v1/chat/completions";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };

async function call(label, body) {
  const started = Date.now();
  try {
    const r = await fetch(base, { method: "POST", headers: hdr, body: JSON.stringify(body) });
    const t = await r.text();
    let c = "", fr = "", usage = {};
    try { const j = JSON.parse(t); c = j?.choices?.[0]?.message?.content || ""; fr = j?.choices?.[0]?.finish_reason || ""; usage = j?.usage || {}; } catch {}
    const denied = /isn.t allowed to use|is not allowed to use/i.test(c);
    lines.push(label.padEnd(30) + "HTTP " + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(9) + " chars=" + String(c.length).padEnd(6) + " fr=" + String(fr).padEnd(8) + (denied ? "DENIED" : "") + (c && !denied ? " | " + c.slice(0, 90).replace(/\n/g, " ") : ""));
    return c;
  } catch (e) {
    lines.push(label.padEnd(30) + "ERR " + e.message);
    return "";
  }
}

// 1) short ping
await call("short ping", { model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 20 });

// 2) medium
await call("medium 500 tok", { model: "z-ai/glm-5.3-flash", messages: [{ role: "user", content: "Write 5 short tips for a roofing company. Plain text." }], max_tokens: 500 });

// 3) long with reasoning off variants
const longSys = "You are MAT LEADS Studio. Output ONLY inner page content for a 1-page business website. No <!doctype>, <html>, <head>, <body>. Open with ONE <style> block defining your own classes, then a HERO, a stats row, a 4-card services grid, an image+text split, an FAQ accordion with <details>/<summary>, and a closing CTA band. Use real image URLs. No markdown, no explanations.";
const longUser = "Build 1 page section for: ACME Roofing, a roofing company in Lagos, Nigeria. Phone +2348012345678. Address 12 Harbour Road, Lagos. Hero image https://picsum.photos/seed/roofing/1600/900. Gallery https://picsum.photos/seed/roofing-1/800/600 and https://picsum.photos/seed/roofing-2/800/600. Every section complete, minimum 2500 characters of body content. End cleanly.";

await call("long 4000 no-reason", { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85 });
await call("long 4000 clear_think", { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85, chat_template_kwargs: { clear_thinking: true } });
await call("long 4000 reason_low", { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85, reasoning_effort: "low" });

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

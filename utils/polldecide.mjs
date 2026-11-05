import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_decide.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = "https://gen.pollinations.ai/v1/chat/completions";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };
const M = "z-ai/glm-5.3-flash";

async function call(body) {
  const started = Date.now();
  const r = await fetch(base, { method: "POST", headers: hdr, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  const m = (j?.choices?.[0]?.message) || {};
  const c = m.content || "";
  const denied = /isn.t allowed to use|is not allowed to use/i.test(c);
  return { id: j?.id || "-", ms: Date.now() - started, denied, len: c.length, reason: (m.reasoning_content || "").length, fr: j?.choices?.[0]?.finish_reason || "", content: c };
}

function log(label, r) {
  lines.push(label.padEnd(34) + "id=" + String(r.id).slice(0, 16).padEnd(18) + (r.ms + "ms").padEnd(9) + (r.denied ? "DENIED" : "OK").padEnd(8) + " len=" + String(r.len).padEnd(6) + " reason=" + String(r.reason).padEnd(6) + " fr=" + r.fr);
}

const longSys = "You are MAT LEADS Studio. Output ONLY inner page content for a 1-page business website. No doctype, no html, no head, no body. One style block, then HERO, stats, services grid, image+text split, FAQ accordion with details and summary, closing CTA band. Use the exact image URLs given. No markdown.";
const longUser = "Build 1 page for ACME Roofing, Lagos. Phone +2348012345678. Hero https://picsum.photos/seed/roofing/1600/900. Gallery https://picsum.photos/seed/roofing-1/800/600. Every section complete, minimum 2500 characters. End cleanly.";

lines.push("=== A. same LONG prompt x6, 4s apart ===");
for (let i = 0; i < 6; i++) {
  const r = await call({ model: M, messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, temperature: 0.85 });
  log("A#" + i, r);
  await sleep(4000);
}
lines.push("");

lines.push("=== B. LONG prompt variants ===");
const variants = [
  ["B1 long no-system", { messages: [{ role: "user", content: longUser }] }],
  ["B2 long mt=8192", { messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 8192 }],
  ["B3 long +clear_thinking", { messages: [{ role: "system", content: longSys }, { role: "user", content: longUser }], max_tokens: 4000, chat_template_kwargs: { clear_thinking: true } }],
  ["B4 long simple-sys", { messages: [{ role: "system", content: "You are a web designer. Reply with HTML only." }, { role: "user", content: longUser }], max_tokens: 4000 }],
  ["B5 short q about website", { messages: [{ role: "user", content: "What sections should a small business website have? Answer in one sentence." }] }]
];
for (const [name, v] of variants) {
  const r = await call({ model: M, max_tokens: 4000, ...v });
  log(name, r);
  await sleep(4000);
}
lines.push("");

lines.push("=== C. prompt-length sweep (benign filler, mt=64) ===");
for (const n of [0, 30, 60, 120, 240, 480, 960]) {
  const filler = "Please answer briefly. ".repeat(n);
  const r = await call({ model: M, messages: [{ role: "user", content: (filler ? filler + " " : "") + "Reply with exactly: OK" }], max_tokens: 64 });
  log("C filler x" + String(n).padEnd(4) + "(" + (filler.length + 24) + "ch)", r);
  await sleep(4000);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

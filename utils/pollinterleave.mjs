import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_interleave.txt";
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
  return { ms: Date.now() - started, denied, len: c.length, reason: (m.reasoning_content || "").length, content: c };
}

const shortMsg = [{ role: "user", content: "Reply with exactly: OK" }];
const medMsg = [{ role: "user", content: "Write one short sentence about roofing. Plain text." }];
const longSys = "You are MAT LEADS Studio. Output ONLY inner page content for a 1-page business website. No doctype, no html, no head, no body. One style block, then HERO, stats, services grid, image+text split, FAQ accordion with details and summary, closing CTA band. Use the exact image URLs given. No markdown.";
const longUser = "Build 1 page for ACME Roofing, Lagos. Phone +2348012345678. Hero https://picsum.photos/seed/roofing/1600/900. Gallery https://picsum.photos/seed/roofing-1/800/600. Every section complete, minimum 2500 characters. End cleanly.";
const longMsg = [{ role: "system", content: longSys }, { role: "user", content: longUser }];

const cases = [
  ["short mt=64", { model: M, messages: shortMsg, max_tokens: 64 }],
  ["med mt=300", { model: M, messages: medMsg, max_tokens: 300 }],
  ["long mt=4000", { model: M, messages: longMsg, max_tokens: 4000 }]
];

for (let round = 0; round < 5; round++) {
  for (const [name, body] of cases) {
    const r = await call(body);
    lines.push("round" + round + " " + name.padEnd(14) + (r.ms + "ms").padEnd(9) + (r.denied ? "DENIED" : "OK").padEnd(8) + " len=" + String(r.len).padEnd(6) + " reason=" + r.reason);
    await sleep(2000);
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

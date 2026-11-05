import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_matrix2.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = "https://gen.pollinations.ai/v1/chat/completions";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };

async function call(label, body) {
  const started = Date.now();
  const r = await fetch(base, { method: "POST", headers: hdr, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  const c = j?.choices?.[0]?.message?.content || "";
  const fr = j?.choices?.[0]?.finish_reason || "";
  const denied = /isn.t allowed to use|is not allowed to use/i.test(c);
  lines.push(label.padEnd(46) + "HTTP " + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(9) +
    " fr=" + String(fr).padEnd(8) + " len=" + String(c.length).padEnd(6) + (denied ? "DENIED" : "OK") +
    (c && !denied ? " | " + c.slice(0, 60).replace(/\n/g, " ") : ""));
  return c;
}

const M = "z-ai/glm-5.3-flash";
const shortPrompt = "Reply with exactly: OK";

// 1) vary max_tokens, short prompt
for (const mt of [20, 64, 128, 256, 512, 1024, 2048, 4000, 8000]) {
  await call("max_tokens=" + String(mt).padEnd(5) + " short prompt", { model: M, messages: [{ role: "user", content: shortPrompt }], max_tokens: mt, stream: false });
  await sleep(2500);
}
lines.push("");

// 2) vary prompt length at fixed max_tokens=64
const longText = "Write detailed marketing copy about roofing services. ".repeat(120);
for (const pl of [10, 50, 100, 200, 400]) {
  const p = longText.slice(0, pl * 5);
  await call("promptChars=" + String(p.length).padEnd(6) + " max_tokens=64", { model: M, messages: [{ role: "user", content: p + "\nReply with exactly: OK" }], max_tokens: 64, stream: false });
  await sleep(2500);
}
lines.push("");

// 3) system+user role split at max_tokens=2000
await call("sys+user max_tokens=2000", { model: M, messages: [{ role: "system", content: "You are a copywriter." }, { role: "user", content: "Write 3 marketing sentences about roofing." }], max_tokens: 2000, stream: false });
await sleep(2500);
await call("user-only max_tokens=2000", { model: M, messages: [{ role: "user", content: "Write 3 marketing sentences about roofing." }], max_tokens: 2000, stream: false });
await sleep(2500);
await call("user-only max_tokens=2000 noTemp", { model: M, messages: [{ role: "user", content: "Write 3 marketing sentences about roofing." }], max_tokens: 2000, stream: false, temperature: 0.5 });
await sleep(2500);

// 4) does a cached/simple prompt work again right now?
await call("short prompt again", { model: M, messages: [{ role: "user", content: shortPrompt }], max_tokens: 64, stream: false });

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

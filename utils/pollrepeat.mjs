import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_repeat.txt";
const lines = ["KEY len=" + key.length];

const DENIED = /isn.t allowed to use|is not allowed to use|allow it for this key/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(model) {
  const started = Date.now();
  const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 64, stream: false })
  });
  const t = await r.text();
  let content = "";
  try { content = String(JSON.parse(t)?.choices?.[0]?.message?.content || ""); } catch {}
  const state = DENIED.test(content) ? "DENIED" : content.trim() ? "OK" : "EMPTY";
  return { state, ms: Date.now() - started, http: r.status, raw: t.slice(0, 220) };
}

for (const model of ["openai/gpt-5.4-nano", "z-ai/glm-5.3-flash"]) {
  for (let i = 0; i < 5; i++) {
    const r = await probe(model);
    lines.push(model.padEnd(26) + " #" + i + " HTTP " + String(r.http).padEnd(4) + (r.ms + "ms").padEnd(8) + r.state.padEnd(7) + JSON.stringify(r.raw.slice(0, 150)));
    await sleep(2500);
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

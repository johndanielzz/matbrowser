import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_matxtest.txt";
const lines = ["KEY len=" + key.length];

const MODELS = [
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
  "openai/gpt-oss-20b",
  "google/gemini-3-flash-preview",
  "openai/gpt-4o-mini",
  "mistralai/mistral-small-3.2",
  "meta/llama-3.3-70b-instruct",
  "openai/gpt-5.4",
  "qwen/qwen3-coder-30b-a3b-instruct",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.5",
  "moonshotai/kimi-k2.6"
];

for (const model of MODELS) {
  const started = Date.now();
  try {
    const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 20, stream: false })
    });
    const t = await r.text();
    let content = "";
    try { content = String(JSON.parse(t)?.choices?.[0]?.message?.content || ""); } catch {}
    lines.push(model.padEnd(38) + " HTTP " + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(8) + " content=" + JSON.stringify(content.slice(0, 60)) + (content ? "" : " RAW=" + t.slice(0, 200)));
  } catch (e) {
    lines.push(model.padEnd(38) + " ERR " + e.message);
  }
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

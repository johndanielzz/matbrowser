import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_matxtest2.txt";
const lines = ["KEY len=" + key.length];

const MODELS = [
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.5",
  "openai/gpt-4o-mini",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  "openai/gpt-5",
  "openai/gpt-5-chat-latest",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "qwen/qwen3-coder-30b-a3b-instruct",
  "qwen/qwen3-next-80b-a3b-instruct",
  "mistralai/mistral-small-3.2",
  "meta/llama-3.3-70b-instruct",
  "moonshotai/kimi-k2.6",
  "z-ai/glm-4.6",
  "z-ai/glm-5.3-flash",
  "deepseek-ai/deepseek-v3.2",
  "nvidia/nemotron-3.5-lightning-30b-a3b"
];

const DENIED = /isn.t allowed to use|is not allowed to use|allow it for this key/i;

for (const model of MODELS) {
  const started = Date.now();
  try {
    const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 64, stream: false })
    });
    const t = await r.text();
    let content = "";
    try { content = String(JSON.parse(t)?.choices?.[0]?.message?.content || ""); } catch {}
    const state = DENIED.test(content) ? "DENIED" : content.trim() ? "OK" : "EMPTY";
    lines.push(model.padEnd(38) + " HTTP " + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(8) + " " + state.padEnd(7) + JSON.stringify(content.slice(0, 70)));
  } catch (e) {
    lines.push(model.padEnd(38) + " ERR " + e.message);
  }
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

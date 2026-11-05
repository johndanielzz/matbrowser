import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_sweep.txt";
const lines = ["KEY len=" + key.length];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DENIED = /isn.t allowed to use|is not allowed to use|allow it for this key/i;

const MODELS = [
  "z-ai/glm-5.3-flash",
  "z-ai/glm-5.3",
  "z-ai/glm-5.2",
  "z-ai/glm-4.6",
  "z-ai/glm-4.5-air",
  "openai/gpt-5.4-nano",
  "openai/gpt-5-nano",
  "openai/gpt-oss-20b",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "qwen/qwen3-coder-30b-a3b-instruct",
  "qwen/qwen3-235b-a22b",
  "qwen/qwen3-8b",
  "mistralai/mistral-small-3.2",
  "mistralai/mistral-large-2411",
  "meta/llama-3.3-70b-instruct",
  "moonshotai/kimi-k2.6",
  "moonshotai/kimi-k2-thinking",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "deepseek-ai/deepseek-v3.2",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "openai/text-embedding-3-small"
];

for (const model of MODELS) {
  const started = Date.now();
  try {
    const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 64, stream: false })
    });
    const t = await r.text();
    let content = "", reasoning = "";
    try {
      const j = JSON.parse(t);
      content = String(j?.choices?.[0]?.message?.content || "");
      reasoning = String(j?.choices?.[0]?.message?.reasoning_content || "");
    } catch {}
    const state = DENIED.test(content) ? "DENIED" : content.trim() ? "OK" : r.ok ? "EMPTY" : "HTTP" + r.status;
    lines.push(model.padEnd(40) + " " + state.padEnd(8) + (Date.now() - started + "ms").padEnd(8) + " c=" + JSON.stringify(content.slice(0, 40)) + " r=" + JSON.stringify(reasoning.slice(0, 30)));
    if (!content.trim() && !r.ok) lines.push("      RAW: " + t.slice(0, 300));
  } catch (e) {
    lines.push(model.padEnd(40) + " ERR " + e.message);
  }
  await sleep(1200);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

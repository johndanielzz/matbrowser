import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_allow.txt";
const lines = [];
const GEN = "https://gen.pollinations.ai/v1/chat/completions";

const models = [
  "z-ai/glm-5.3-flash", "z-ai/glm-5.3", "openai/gpt-oss-20b", "openai/gpt-oss-120b",
  "openai/gpt-5.4-nano", "openai/gpt-5-nano", "openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-5.5",
  "google/gemini-3-flash-preview", "google/gemma-3-27b-it",
  "mistralai/mistral-small-3.2", "meta/llama-3.3-70b-instruct", "qwen/qwen3-coder-30b-a3b-instruct",
  "moonshotai/kimi-k2.6", "openai/gpt-4o-mini", "openai-fast", "openai",
];

async function probe(model) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(GEN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Say OK" }], max_tokens: 300, stream: false }),
      signal: ctl.signal,
    });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const c = (j?.choices?.[0]?.message)?.content || "";
    const denied = /isn.t allowed to use|not allowed for this API key/i.test(c + txt);
    const bad = /Invalid model or alias|MODEL_NOT_FOUND/i.test(txt);
    return { model, status: r.status, id: (j?.id || "-").slice(0, 14), len: c.length, state: denied ? "DENIED" : bad ? "BADID" : c.trim() ? "ALLOWED" : "EMPTY", note: (denied || bad ? txt : c).slice(0, 70).replace(/\n/g, " ") };
  } catch (e) {
    return { model, status: 0, id: "-", len: 0, state: "ERR", note: e.name };
  } finally { clearTimeout(t); }
}

for (const m of models) {
  const r = await probe(m);
  lines.push(m.padEnd(32) + "HTTP" + String(r.status).padEnd(4) + r.state.padEnd(8) + "id=" + String(r.id).padEnd(16) + "len=" + String(r.len).padEnd(5) + r.note);
  writeFileSync(out, lines.join("\n"), "utf8");
}
console.log("wrote " + out);

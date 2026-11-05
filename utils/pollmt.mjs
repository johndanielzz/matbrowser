import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_mtsweep.txt";
const lines = [];
const GEN = "https://gen.pollinations.ai/v1/chat/completions";

async function post(body, timeout = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(GEN, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key }, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    return { status: r.status, id: (j?.id || "-"), len: c.length, denied: /isn.t allowed to use|not allowed for this API key|allow it for this key/i.test(c + txt), content: c, usage: j?.usage || {} };
  } catch (e) { return { status: 0, id: "-", len: 0, denied: false, content: "", usage: {} }; }
  finally { clearTimeout(t); }
}

lines.push("=== max_tokens fine sweep (tiny prompt, glm-5.3-flash) ===");
const M = process.argv[3] || "z-ai/glm-5.3-flash";
for (const mt of [64, 100, 150, 200, 250, 280, 290, 295, 299, 300, 301, 310, 320, 350, 400, 450, 500, 600, 700, 800]) {
  const r = await post({ model: M, messages: [{ role: "user", content: "Say OK" }], max_tokens: mt, stream: false });
  lines.push("mt=" + String(mt).padEnd(5) + "HTTP" + String(r.status).padEnd(4) + (r.denied ? "DENIED" : "ALLOW").padEnd(7) + "id=" + String(r.id).slice(0, 15).padEnd(17) + "len=" + String(r.len).padEnd(5) + "ctok=" + (r.usage?.completion_tokens ?? "-"));
  writeFileSync(out, lines.join("\n"), "utf8");
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

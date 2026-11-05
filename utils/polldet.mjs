import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_det.txt";
const lines = [];
const GEN = "https://gen.pollinations.ai/v1/chat/completions";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(body, timeout = 90000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(GEN, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key }, body: JSON.stringify(body), signal: ctl.signal });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    return { status: r.status, id: (j?.id || "-"), len: c.length, denied: /isn.t allowed to use|not allowed for this API key|allow it for this key/i.test(c + txt), content: c, raw: txt, usage: j?.usage || {} };
  } catch (e) { return { status: 0, id: "-", len: 0, denied: false, content: "", raw: String(e.message), usage: {} }; }
  finally { clearTimeout(t); }
}
const show = (label, r) => {
  lines.push(label.padEnd(46) + "HTTP" + String(r.status).padEnd(4) + (r.denied ? "DENIED" : "ALLOW").padEnd(7) + "id=" + String(r.id).slice(0, 15).padEnd(17) + "len=" + String(r.len).padEnd(6) + "ctok=" + (r.usage?.completion_tokens ?? "-") + " ptok=" + (r.usage?.prompt_tokens ?? "-"));
  writeFileSync(out, lines.join("\n"), "utf8");
  return r;
};

const M = "z-ai/glm-5.3-flash";
const bodyA = { model: M, messages: [{ role: "user", content: "Say OK" }], max_tokens: 300, stream: false };
const bodyB = { model: M, messages: [{ role: "user", content: "Say OK" }], max_tokens: 301, stream: false };
const bodyC = { model: M, messages: [{ role: "user", content: "Say OK" }], max_tokens: 302, stream: false };

lines.push("=== determinism: A/B/C repeated 4x, mt differs by 1 ===");
for (let i = 0; i < 4; i++) {
  show("A mt=300 #" + i, await post(bodyA));
  await sleep(1500);
  show("B mt=301 #" + i, await post(bodyB));
  await sleep(1500);
  show("C mt=302 #" + i, await post(bodyC));
  await sleep(1500);
}
lines.push("");
lines.push("=== same body, 3x back to back (no sleep) ===");
for (let i = 0; i < 3; i++) show("A repeat #" + i, await post(bodyA));
lines.push("");
lines.push("=== no-auth header version of A ===");
{
  const r = await fetch(GEN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyB) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  const c = (j?.choices?.[0]?.message)?.content || "";
  lines.push("no-auth mt=301 -> HTTP" + r.status + " id=" + String(j?.id || "-").slice(0, 15) + " len=" + c.length + " denied=" + /isn.t allowed to use/i.test(c + txt));
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

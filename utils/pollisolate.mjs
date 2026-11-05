import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_isolate.txt";
const lines = [];
const GEN = "https://gen.pollinations.ai/v1/chat/completions";

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
  lines.push(label.padEnd(50) + "HTTP" + String(r.status).padEnd(4) + (r.denied ? "DENIED" : "ALLOW").padEnd(7) + "id=" + String(r.id).slice(0, 15).padEnd(17) + "len=" + String(r.len).padEnd(6) + "ctok=" + (r.usage?.completion_tokens ?? "-"));
  writeFileSync(out, lines.join("\n"), "utf8");
  return r;
};
const M = "z-ai/glm-5.3-flash";

lines.push("=== isolate: what triggers the denial? (model " + M + ") ===");
lines.push("");
lines.push("-- max_tokens sweep, TINY prompt --");
for (const mt of [100, 300, 1000, 2000, 4000, 8000]) {
  const r = await post({ model: M, messages: [{ role: "user", content: "Say OK" }], max_tokens: mt, stream: false });
  show("tiny mt=" + mt, r);
}
lines.push("");
lines.push("-- WEBSITE prompt, max_tokens sweep --");
const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page. ONE <style> block. Then HERO, stats, services, FAQ, form.";
const USER = "Business: ACME Roofing, Lagos. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Write 1 page.";
for (const mt of [100, 300, 1000, 4000]) {
  const r = await post({ model: M, messages: [{ role: "system", content: SYS }, { role: "user", content: USER }], max_tokens: mt, stream: false });
  show("web mt=" + mt, r);
}
lines.push("");
lines.push("-- user prompt length sweep (system fixed) --");
for (const n of [1, 20, 60, 120, 200, 400]) {
  const filler = "x ".repeat(n);
  const r = await post({ model: M, messages: [{ role: "user", content: "Write HTML for a roofing site. " + filler }], max_tokens: 300, stream: false });
  show("userwords=" + n + " promptchars=" + (filler.length + 40), r);
}
lines.push("");
lines.push("-- full denial text (web prompt, mt=1000) --");
{
  const r = await post({ model: M, messages: [{ role: "system", content: SYS }, { role: "user", content: USER }], max_tokens: 1000, stream: false });
  lines.push(r.content);
  lines.push("--- RAW ---");
  lines.push(r.raw.slice(0, 1500));
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

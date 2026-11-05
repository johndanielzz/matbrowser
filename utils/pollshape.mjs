import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_shape.txt";
const lines = [];
const GEN = "https://gen.pollinations.ai/v1/chat/completions";

const SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page. ONE <style> block. Then HERO, stats, services, FAQ, form.";
const USER = "Business: ACME Roofing, Lagos. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Write 1 page.";

async function post(body, timeout = 90000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const started = Date.now();
  try {
    const r = await fetch(GEN, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    const denied = /isn.t allowed to use|not allowed for this API key|allow it for this key/i.test(c + txt);
    return { status: r.status, ms: Date.now() - started, id: (j?.id || "-"), len: c.length, fr: j?.choices?.[0]?.finish_reason || "", denied, content: c, raw: txt, usage: j?.usage || {} };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, id: "-", len: 0, fr: "ERR:" + e.name, denied: false, content: "", raw: String(e.message), usage: {} };
  } finally { clearTimeout(t); }
}

const qz = (c) => "w=" + String(c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length).padEnd(5) +
  "style=" + (c.match(/<style/gi) || []).length + " img=" + (c.match(/<img/gi) || []).length + " det=" + (c.match(/<details/gi) || []).length + " fence=" + (c.match(/```/g) || []).length;
const show = (label, r) => {
  lines.push(label.padEnd(58) + "HTTP" + String(r.status).padEnd(4) + (r.ms + "ms").padEnd(8) + "id=" + String(r.id).slice(0, 15).padEnd(17) + "len=" + String(r.len).padEnd(6) + "fr=" + String(r.fr).padEnd(8) + (r.denied ? "DENIED " : "") + qz(r.content) + " ctok=" + (r.usage?.completion_tokens ?? "-") + " rtok=" + (r.usage?.completion_tokens_details?.reasoning_tokens ?? "-"));
  writeFileSync(out, lines.join("\n"), "utf8");
};

lines.push("=== Does the WEBSITE_PROMPT shape change the verdict per model? (service sends max_tokens/top_p/temperature) ===");
const models = ["openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-5-nano", "moonshotai/kimi-k2.6", "z-ai/glm-5.3-flash", "openai/gpt-oss-20b", "meta/llama-3.3-70b-instruct"];
for (const m of models) {
  const r = await post({ model: m, messages: [{ role: "system", content: SYS }, { role: "user", content: USER }], max_tokens: 4000, temperature: 0.85, top_p: 1, stream: false });
  show("full-shape mt=4000 " + m, r);
  const t = await post({ model: m, messages: [{ role: "user", content: "Say OK" }], max_tokens: 300, stream: false });
  show("tiny         " + m, t);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

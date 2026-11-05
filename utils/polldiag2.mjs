import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_diag2.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GEN = "https://gen.pollinations.ai/v1/chat/completions";
const CLASSIC = "https://text.pollinations.ai/openai";

async function post(url, body, { auth = true, timeout = 200000 } = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (auth && key) headers.Authorization = "Bearer " + key;
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctl.signal });
    const t2 = await r.text();
    let j = null;
    try { j = JSON.parse(t2); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const u = j?.usage || {};
    return {
      status: r.status, ms: Date.now() - started, id: j?.id || "-", model: j?.model || "-",
      len: (m.content || "").length, fr: j?.choices?.[0]?.finish_reason || "",
      content: m.content || "", raw: t2,
      reasoning: m.reasoning || m.reasoning_content || "",
      reasonTokens: u?.completion_tokens_details?.reasoning_tokens ?? u?.output_tokens_details?.reasoning_tokens ?? null,
      completionTokens: u?.completion_tokens ?? null, promptTokens: u?.prompt_tokens ?? null,
    };
  } catch (e) {

const WS_SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of AT MOST 25 short rules using your own prefixed class names. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const wsUser = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";

const qz = (c) => {
  const w = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return "w=" + String(w).padEnd(5) + "style=" + (c.match(/<style/gi) || []).length + " img=" + String((c.match(/<img/gi) || []).length).padEnd(3) + "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) + "form=" + (c.match(/<form/gi) || []).length + "picsum=" + (c.match(/picsum/gi) || []).length + "fence=" + (c.match(/```/g) || []).length;
};

lines.push("=== GEN: unique prompt, big website request, several models (uncached) ===");
for (const model of ["z-ai/glm-5.3-flash", "openai/gpt-oss-120b", "openai/gpt-5-nano", "google/gemini-3-flash-preview"]) {
  const r = await post(GEN, { model, messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: 6000, temperature: 0.8 });
  lines.push(model.padEnd(30) + tag(r) + (denied(r) ? " DENIED" : "") + " " + qz(r.content));
  await sleep(2500); flush();
}
lines.push("");

lines.push("=== GEN: same model, max_tokens sweep, unique prompt ===");
for (const mt of [2000, 4000, 8000]) {
  const r = await post(GEN, { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: mt, temperature: 0.8 });
  lines.push("mt=" + String(mt).padEnd(6) + tag(r) + (denied(r) ? " DENIED" : "") + " " + qz(r.content));
  await sleep(2500); flush();
}
lines.push("");

lines.push("=== GEN: reasoning_effort low / clear_thinking on glm-5.3-flash ===");
for (const extra of [{ reasoning_effort: "low" }, { chat_template_kwargs: { clear_thinking: true } }, { reasoning_effort: "low", chat_template_kwargs: { clear_thinking: true } }]) {

lines.push("=== CLASSIC: unique prompt, big website request, several models ===");
for (const model of ["openai-fast", "openai", "gpt-oss-120b", "mistral"]) {
  const r = await post(CLASSIC, { model, messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: 6000, temperature: 0.8 });
  lines.push(model.padEnd(16) + tag(r) + (denied(r) ? " DENIED" : "") + " " + qz(r.content));
  await sleep(2500); flush();
}
lines.push("");

lines.push("=== CLASSIC: max_tokens sweep (uncached) ===");
for (const mt of [2000, 8000, 20000]) {
  const r = await post(CLASSIC, { model: "openai-fast", messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: mt, temperature: 0.8 });
  lines.push("mt=" + String(mt).padEnd(6) + tag(r) + (denied(r) ? " DENIED" : "") + " " + qz(r.content));
  await sleep(2500); flush();
}
lines.push("");

lines.push("=== CLASSIC: reasoning_effort / clear_thinking on openai-fast ===");
for (const extra of [{ reasoning_effort: "low" }, { chat_template_kwargs: { clear_thinking: true } }]) {
  const r = await post(CLASSIC, { model: "openai-fast", messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: 6000, temperature: 0.8, ...extra });
  lines.push(JSON.stringify(extra).padEnd(50) + tag(r) + (denied(r) ? " DENIED" : "") + " " + qz(r.content));
  await sleep(2500); flush();
}
lines.push("");

lines.push("=== CLASSIC: full HTML dump of best-looking request ===");
{
  const r = await post(CLASSIC, { model: "openai-fast", messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: 20000, temperature: 0.8 });
  lines.push(tag(r));
  lines.push("----BEGIN----");
  lines.push(r.content);
  lines.push("----END----");
}
lines.push("");

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

  const r = await post(GEN, { model: "z-ai/glm-5.3-flash", messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: 6000, temperature: 0.8, ...extra });
  lines.push(JSON.stringify(extra).padEnd(62) + tag(r) + (denied(r) ? " DENIED" : "") + " " + qz(r.content) + " reason=" + r.reasoning.slice(0, 50).replace(/\n/g, " "));
  await sleep(2500); flush();
}
lines.push("");

    return { status: 0, ms: Date.now() - started, id: "-", model: "-", len: 0, fr: "ERR:" + e.name, content: "", raw: String(e.message), reasoning: "", reasonTokens: null, completionTokens: null, promptTokens: null };
  } finally { clearTimeout(t); }
}

const nonce = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const tag = (r) => "HTTP" + String(r.status).padEnd(4) + (r.ms + "ms").padEnd(9) + "id=" + String(r.id).slice(0, 15).padEnd(17) + "model=" + String(r.model).slice(0, 18).padEnd(20) + "len=" + String(r.len).padEnd(5) + "fr=" + String(r.fr).padEnd(8) + "ct=" + String(r.completionTokens).padEnd(6) + "rtok=" + String(r.reasonTokens).padEnd(6);
const denied = (r) => /isn.t allowed to use|not allowed for this API key|FREE_LIMIT|PRO_REQUIRED/i.test(r.content + r.raw);
const flush = () => { try { writeFileSync(out, lines.join("\n"), "utf8"); } catch {} };

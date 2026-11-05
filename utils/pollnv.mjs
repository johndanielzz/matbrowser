import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const get = (n) => (envText.match(new RegExp("^" + n + "=(.*)$", "m"))?.[1] || "").trim().replace(/^["']|["']$/g, "");
const nvKey = get("NVIDIA_API_KEY");
const nvBase = get("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1";
const out = process.argv[2] || "logs/_nv.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WS_SYS = "You are a senior web designer. Return ONLY the inner HTML of a business website page (no doctype/html/head/body). Rules: ONE <style> block of AT MOST 25 short rules using your own prefixed class names. Then: HERO (eyebrow, h1, paragraph, 2 buttons), stats row (4 numbers), services grid (4 cards), image+text split, FAQ accordion using <details>/<summary> (4 items), contact form. Put the given image URLs in <img src> with alt text. No markdown fences. Be complete but concise.";
const nonce = () => "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const wsUser = (n) => "Business: ACME Roofing " + n + ", Lagos, Nigeria. Phone +2348012345678. Hero image URL: https://picsum.photos/seed/roofing/1600/900. Gallery image URL: https://picsum.photos/seed/roofing-1/800/600. Write 1 page using the image URLs exactly. End cleanly with </section>.";

const qz = (c) => {
  const w = c.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return "w=" + String(w).padEnd(5) + "style=" + (c.match(/<style/gi) || []).length + " img=" + String((c.match(/<img/gi) || []).length).padEnd(3) + "det=" + String((c.match(/<details/gi) || []).length).padEnd(3) + "form=" + (c.match(/<form/gi) || []).length + "picsum=" + (c.match(/picsum/gi) || []).length + "fence=" + (c.match(/```/g) || []).length;
};

async function nv(model, mt, extra = {}) {
  const started = Date.now();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetch(nvBase + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + nvKey },
      body: JSON.stringify({ model, messages: [{ role: "system", content: WS_SYS }, { role: "user", content: wsUser(nonce()) }], max_tokens: mt, temperature: 0.8, stream: false, ...extra }),
      signal: ctl.signal,
    });
    const txt = await r.text();
    let j = null;
    try { j = JSON.parse(txt); } catch {}
    const m = (j?.choices?.[0]?.message) || {};
    const c = m.content || "";
    const u = j?.usage || {};
    lines.push(model.padEnd(28) + "mt=" + String(mt).padEnd(6) + "HTTP" + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(9) + "id=" + String(j?.id || "-").slice(0, 15).padEnd(17) + "len=" + String(c.length).padEnd(6) + "fr=" + String(j?.choices?.[0]?.finish_reason || "").padEnd(8) + "rtok=" + String(u?.completion_tokens_details?.reasoning_tokens ?? "-").padEnd(6) + qz(c));
    if (!r.ok) lines.push("   RAW: " + txt.slice(0, 260).replace(/\n/g, " "));
    return c;
  } catch (e) {
    lines.push(model.padEnd(28) + "mt=" + String(mt).padEnd(6) + "ERR " + e.name + " " + e.message);
    return "";
  } finally { clearTimeout(t); }
}

lines.push("=== NVIDIA website generation probe ===");
for (const model of ["openai/gpt-oss-20b", "z-ai/glm-5.3-flash"]) {
  await nv(model, 6000, { reasoning_effort: "low" });
  await sleep(2500);
}
for (const mt of [4000, 8000]) {
  await nv("openai/gpt-oss-20b", mt);
  await sleep(2500);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

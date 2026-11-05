import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_long.txt";
const lines = [];

const body = {
  model: "z-ai/glm-5.3-flash",
  messages: [
    { role: "system", content: "You are MAT LEADS Studio. Output ONLY inner page content for a 1-page business website. No <!doctype>, <html>, <head>, <body>. Open with ONE <style> block defining your own classes, then a HERO (eyebrow, headline, sentence, two buttons), a stats row, a 4-card services grid, an image+text split, an FAQ accordion with <details>/<summary>, and a closing CTA band. Use real image URLs. No markdown, no explanations." },
    { role: "user", content: "Build 1 page section for: ACME Roofing, a roofing company in Lagos, Nigeria. Phone +2348012345678. Address 12 Harbour Road, Lagos. Hero image https://picsum.photos/seed/roofing/1600/900. Gallery https://picsum.photos/seed/roofing-1/800/600 and https://picsum.photos/seed/roofing-2/800/600. Be fully detailed, every section complete, minimum 2500 characters of body content. End cleanly." }
  ],
  max_tokens: 4000,
  temperature: 0.85,
  stream: false
};

const started = Date.now();
const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key },
  body: JSON.stringify(body),
});
const text = await r.text();
lines.push("HTTP " + r.status + " in " + (Date.now() - started) + "ms");
let content = "";
try {
  const j = JSON.parse(text);
  content = j?.choices?.[0]?.message?.content || "";
  lines.push("finish_reason=" + j?.choices?.[0]?.finish_reason);
  lines.push("usage=" + JSON.stringify(j?.usage || {}));
} catch {
  lines.push("RAW: " + text.slice(0, 500));
}
lines.push("content chars=" + content.length);
lines.push("visible words=" + content.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length);
lines.push("has style=" + /<style/i.test(content));
lines.push("has img=" + (content.match(/<img/gi) || []).length);
lines.push("has details=" + /<details/i.test(content));
lines.push("has h1=" + (content.match(/<h1/gi) || []).length);
lines.push("---- CONTENT ----");
lines.push(content);
writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out + " chars=" + content.length);

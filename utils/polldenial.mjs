import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_full.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const base = "https://gen.pollinations.ai/v1/chat/completions";
const hdr = { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + key };
const M = "z-ai/glm-5.3-flash";

async function raw(body) {
  const r = await fetch(base, { method: "POST", headers: hdr, body: JSON.stringify(body) });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch {}
  return { status: r.status, j, text: t };
}

// 1) print the FULL denial body once
lines.push("=== FULL denial body ===");
const d = await raw({ model: M, messages: [{ role: "user", content: "Write a long detailed paragraph about roofing services in Lagos Nigeria with prices and benefits." }], max_tokens: 500 });
lines.push("HTTP " + d.status);
lines.push("RAW: " + d.text);
lines.push("");

// 2) precise length sweep, 24..400 chars, all with mt=64
lines.push("=== length sweep mt=64 ===");
for (const n of [24, 32, 40, 48, 56, 64, 80, 100, 130, 160, 200, 260, 320, 400]) {
  const p = ("x".repeat(Math.max(0, n - 24)) + "Reply with exactly: OK").slice(0, n);
  const r = await raw({ model: M, messages: [{ role: "user", content: p }], max_tokens: 64 });
  const c = r.j?.choices?.[0]?.message?.content || "";
  const denied = /isn.t allowed to use|is not allowed to use/i.test(c);
  lines.push("len=" + String(p.length).padEnd(5) + (denied ? "DENIED" : "OK").padEnd(8) + "id=" + String(r.j?.id || "-").slice(0, 14).padEnd(16) + "fr=" + (r.j?.choices?.[0]?.finish_reason || "-"));
  await sleep(2500);
}
lines.push("");

// 3) same length (120 chars), repeated 6x -> stability
lines.push("=== stability: 120-char prompt x6 ===");
const p120 = "Write exactly three short bullet points about the benefits of professional roofing installation services today.";
for (let i = 0; i < 6; i++) {
  const r = await raw({ model: M, messages: [{ role: "user", content: p120 }], max_tokens: 200 });
  const c = r.j?.choices?.[0]?.message?.content || "";
  const rc = r.j?.choices?.[0]?.message?.reasoning_content || "";
  const denied = /isn.t allowed to use|is not allowed to use/i.test(c);
  lines.push("#" + i + " " + (denied ? "DENIED" : "OK").padEnd(8) + "id=" + String(r.j?.id || "-").slice(0, 14).padEnd(16) + "fr=" + String(r.j?.choices?.[0]?.finish_reason || "-").padEnd(8) + "len=" + String(c.length).padEnd(5) + "reason=" + rc.length + " usage=" + JSON.stringify(r.j?.usage || {}));
  await sleep(2500);
}
lines.push("");

// 4) no auth header at all
lines.push("=== no auth ===");
const r2 = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: M, messages: [{ role: "user", content: "Reply OK" }], max_tokens: 50 }) });
lines.push("HTTP " + r2.status + " :: " + (await r2.text()).slice(0, 400));
lines.push("");

// 5) legacy /v1 endpoint variants
lines.push("=== endpoint variants ===");
for (const u of ["https://gen.pollinations.ai/v1/chat/completions", "https://text.pollinations.ai/openai", "https://gen.pollinations.ai/v1/responses"]) {
  try {
    const r3 = await fetch(u, { method: "POST", headers: hdr, body: JSON.stringify({ model: M, messages: [{ role: "user", content: "Reply OK" }], max_tokens: 50, input: "Reply OK" }) });
    const t3 = await r3.text();
    lines.push(u.padEnd(48) + "HTTP " + r3.status + " :: " + t3.slice(0, 200).replace(/\n/g, " "));
  } catch (e) { lines.push(u.padEnd(48) + "ERR " + e.message); }
  await sleep(2000);
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_models.txt";
const lines = [];

async function get(url, useAuth = true) {
  const headers = { Accept: "application/json" };
  if (useAuth && key) headers.Authorization = "Bearer " + key;
  try {
    const r = await fetch(url, { headers });
    const t = await r.text();
    return { status: r.status, body: t };
  } catch (e) { return { status: 0, body: String(e.message) }; }
}

for (const u of [
  "https://gen.pollinations.ai/v1/models",
  "https://text.pollinations.ai/models",
  "https://gen.pollinations.ai/v1/models?category=text",
]) {
  const r = await get(u);
  lines.push("=== " + u + " -> HTTP " + r.status);
  let j = null;
  try { j = JSON.parse(r.body); } catch {}
  const arr = Array.isArray(j) ? j : (j?.data || j?.models || null);
  if (Array.isArray(arr)) {
    const ids = arr.map((m) => String(m?.id || m?.name || m)).filter(Boolean);
    lines.push("count=" + ids.length);
    lines.push(ids.slice(0, 400).join("\n"));
  } else {
    lines.push(r.body.slice(0, 3000));
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

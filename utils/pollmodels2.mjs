import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_models2.txt";
const lines = ["KEY len=" + key.length];

const base = "https://gen.pollinations.ai";
const headers = { Authorization: "Bearer " + key, Accept: "application/json" };

for (const path of ["/v1/models", "/models"]) {
  try {
    const r = await fetch(base + path, { headers });
    const t = await r.text();
    lines.push("\n### " + path + " HTTP " + r.status + " len=" + t.length);
    lines.push(t.slice(0, 4000));
  } catch (e) {
    lines.push("\n### " + path + " ERR " + e.message);
  }
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

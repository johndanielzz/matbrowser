import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] || "logs/_nvc.txt";
const files = process.argv.slice(3);
const lines = [];

for (const f of files) {
  let text = "";
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const t = text.split(/\r?\n/);
  lines.push("=== " + f + " ===");
  for (let i = 0; i < t.length; i++) {
    if (/nvidia/i.test(t[i])) {
      lines.push(String(i + 1).padStart(5) + " | " + t[i].trim().slice(0, 150));
    }
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

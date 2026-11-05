import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] || "logs/_methods.txt";
const files = process.argv.slice(3);
const lines = [];

for (const f of files) {
  const text = readFileSync(f, "utf8");
  const t = text.split(/\r?\n/);
  lines.push("=== " + f + " (" + t.length + " lines) ===");
  let inClass = false;
  for (let i = 0; i < t.length; i++) {
    const line = t[i];
    if (/^(export )?class /.test(line)) inClass = true;
    const m = line.match(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/);
    if (m && !/^(if|for|while|switch|catch|return|constructor)$/.test(m[1])) {
      lines.push(String(i + 1).padStart(5) + "  " + m[1].padEnd(26) + "(" + m[2] + ")");
    }
    const top = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/);
    if (top) lines.push(String(i + 1).padStart(5) + "  fn:" + top[1]);
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

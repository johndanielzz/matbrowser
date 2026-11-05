import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const out = process.argv[3] || "logs/_routes.txt";
const text = readFileSync(file, "utf8").split(/\r?\n/);

const rows = [];
let cur = null;
for (let i = 0; i < text.length; i++) {
  const line = text[i];
  const rm = line.match(/^\s*regex:\s*(\/.*\/[a-z]*)\s*,?\s*$/);
  if (rm) {
    cur = { line: i + 1, path: rm[1], body: [] };
    rows.push(cur);
  }
  if (cur) cur.body.push(line);
}

const findings = rows.map((r) => {
  const body = r.body.join("\n");
  const uses = [];
  if (/nvidia/i.test(body)) uses.push("NVIDIA");
  if (/pollinations/i.test(body)) uses.push("POLL");
  if (/media/i.test(body)) uses.push("MEDIA");
  return { line: r.line, path: r.path, uses: uses.join("+") || "-" };
});

writeFileSync(out, findings.map((f) => String(f.line).padStart(5) + "  " + f.path.slice(0, 56).padEnd(58) + " -> " + f.uses).join("\n"), "utf8");
console.log("wrote " + out + " (" + findings.length + " routes)");

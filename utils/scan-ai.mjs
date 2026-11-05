import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.argv[2] || ".";
const OUT = process.argv[3] || "logs/_scan.txt";
const SKIP = new Set(["node_modules", ".git", ".chrome-profile", ".firefox-profile", "logs", ".next", "dist", "coverage", ".vercel"]);
const EXTS = new Set([".js", ".mjs", ".cjs", ".html", ".css", ".json", ".md", ".ps1", ".txt"]);

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (EXTS.has(full.slice(full.lastIndexOf(".")).toLowerCase())) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const lines = [];

for (const f of files) {
  let text = "";
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  const rel = relative(ROOT, f);
  const hits = [];
  const patterns = [
    ["NVIDIA/nim", /\bnvidia\b|nvidiaService|NVIDIA_|integrate\.api\.nvidia/gi],
    ["pollinations", /pollinations/gi],
    ["genurl", /gen\.pollinations\.ai/gi],
    ["key-leak", /POLLINATIONS_API_KEY|sk_[A-Za-z0-9]{8,}|pk_[A-Za-z0-9]{8,}/g]
  ];
  for (const [label, re] of patterns) {
    const m = text.match(re);
    if (m) hits.push(label + "=" + m.length);
  }
  if (hits.length) lines.push(rel.padEnd(46) + "  " + hits.join("  "));
}

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log("scanned " + files.length + " files -> " + OUT);

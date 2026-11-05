import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] || "logs/_health.txt";
const url = process.argv[3] || "http://localhost:3111/api/health";

try {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  const t = await r.text();
  writeFileSync(out, "HTTP " + r.status + "\n" + t, "utf8");
  console.log("HTTP " + r.status + " -> " + out);
} catch (e) {
  writeFileSync(out, "ERR " + e.message, "utf8");
  console.log("ERR " + e.message + " -> " + out);
}

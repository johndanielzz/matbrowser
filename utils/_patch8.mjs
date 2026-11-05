import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

const old = `      const slug = String(business).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 14) || "site";`;
const neu = `      // Each page gets its OWN class prefix: a <style> block applies document-wide
      // even when its parent page is hidden, so a shared prefix would let one
      // page's rules restyle another page.
      const slug = (String(business).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 12) || "site")
        + "-" + String(spec.id || targetSpecs.indexOf(spec) + 1).toLowerCase().replace(/[^a-z0-9]+/g, "");`;
if (!s.includes(old)) { console.error("SLUG ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(old, neu);

writeFileSync(p, s, "utf8");
console.log("ok");

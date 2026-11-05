import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

// Import the repair helper.
const imp = `import { hasRealContent, visibleWordCount } from "../utils/siteContent.js";`;
if (s.includes(imp)) {
  s = s.replace(imp, `import { hasRealContent, visibleWordCount, repairTruncatedHtml } from "../utils/siteContent.js";`);
} else {
  console.error("IMPORT ANCHOR NOT FOUND");
  process.exit(1);
}

// Repair each page body: close dangling tags left by the token cap.
const oldPush = `      pageBodies.push(pageContent);`;
const newPush = `      // A page cut off by the token cap leaves dangling tags; close them so the
      // section still renders instead of swallowing the rest of the document.
      const repaired = repairTruncatedHtml(pageContent);
      if (repaired.repaired) pageContent = repaired.html;
      pageBodies.push(pageContent);`;
if (!s.includes(oldPush)) { console.error("PUSH ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(oldPush, newPush);

writeFileSync(p, s, "utf8");
console.log("ok");

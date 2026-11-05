import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

// Import the section guard.
const impOld = `import { hasRealContent, visibleWordCount, repairTruncatedHtml } from "../utils/siteContent.js";`;
const impNew = `import { hasRealContent, visibleWordCount, repairTruncatedHtml, missingPageSections } from "../utils/siteContent.js";`;
if (!s.includes(impOld)) { console.error("IMPORT ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(impOld, impNew);

// Use it in the retry condition and keep the better of the two attempts.
const oldCond = `      if (truncated || !hasRealContent(pageContent) || visibleWordCount(pageContent) < 60) {
        try {
          const retry = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_RETRY, "", [spec], true);
          const retryBody = repairTruncatedHtml(String(retry.content || ""));
          if (retryBody.html.length > pageContent.length || truncated) {
            pageContent = retryBody.html;
            if (!result) result = retry;
          }
        } catch {
          /* keep the first attempt */
        }
      }`;
const newCond = `      // Retry when the page was cut off, is too thin, or is missing a required
      // section (the FAQ or contact form are the usual casualties of a cut reply).
      const missingSections = missingPageSections(pageContent);
      if (truncated || missingSections.length || !hasRealContent(pageContent) || visibleWordCount(pageContent) < 60) {
        try {
          const retry = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_RETRY, "", [spec], true);
          const retryBody = repairTruncatedHtml(String(retry.content || ""));
          const retryMissing = missingPageSections(retryBody.html);
          // Prefer the retry when it is more complete; otherwise keep the original.
          const better = retryMissing.length < missingSections.length
            || (retryMissing.length === missingSections.length && retryBody.html.length > pageContent.length)
            || (missingSections.length > 0 && retryMissing.length === 0);
          if (better) {
            pageContent = retryBody.html;
            if (!result) result = retry;
          }
        } catch {
          /* keep the first attempt */
        }
      }`;
if (!s.includes(oldCond)) { console.error("COND ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(oldCond, newCond);

writeFileSync(p, s, "utf8");
console.log("ok");

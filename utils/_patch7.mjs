import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

const start = s.indexOf("    // One request per page.");
const endMarker = "    const fragments = pageBodies.map";
const end = s.indexOf(endMarker, start);
if (start === -1 || end === -1) { console.error("ANCHORS NOT FOUND"); process.exit(1); }

const replacement = `    // One request per page. The Classic endpoint caps a reply at ~1500 tokens,
    // so asking for every page in one call truncates the last page mid-section.
    // Per-page calls keep each page complete on every provider.
    const pageBodies = [];
    let result = null;
    for (let i = 0; i < pageSpecs.length; i++) {
      const spec = pageSpecs[i];
      let pageContent = "";
      let truncated = false;
      try {
        const attempt = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_FIRST, "", [spec]);
        pageContent = String(attempt.content || "");
        truncated = String(attempt.finishReason || "").toLowerCase() === "length";
        if (!result) result = attempt;
      } catch (error) {
        if (!result) throw error;
      }
      // A page cut off by the token cap leaves dangling tags; close them so the
      // section still renders instead of swallowing the rest of the document.
      let repaired = repairTruncatedHtml(pageContent);
      if (repaired.repaired) { pageContent = repaired.html; truncated = true; }
      // Truncated or too thin: retry with the terse prompt, which asks for a
      // shorter page that fits the cap instead of repeating the same overflow.
      if (truncated || !hasRealContent(pageContent) || visibleWordCount(pageContent) < 60) {
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
      }
      pageBodies.push(pageContent);
    }
`;

s = s.slice(0, start) + replacement + s.slice(end);
writeFileSync(p, s, "utf8");
console.log("ok");

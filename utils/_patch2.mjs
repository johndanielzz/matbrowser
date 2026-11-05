import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

const oldBlock = `    let result = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_FIRST);
    let content = String(result.content || "");`;

const newBlock = `    // One request per page. The Classic endpoint caps a reply at ~1500 tokens,
    // so asking for every page in one call truncates the last page mid-section.
    // Per-page calls keep each page complete on every provider.
    const pageBodies = [];
    let result = null;
    for (let i = 0; i < pageSpecs.length; i++) {
      const spec = pageSpecs[i];
      let pageContent = "";
      try {
        const attempt = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_FIRST, "", [spec]);
        pageContent = String(attempt.content || "");
        if (!result) result = attempt;
      } catch (error) {
        if (!result) throw error;
      }
      if (!hasRealContent(pageContent) || visibleWordCount(pageContent) < 60) {
        try {
          const retry = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_RETRY, "The previous attempt was cut short - write this page FULLY complete, every section finished, no truncation.", [spec]);
          if (String(retry.content || "").length > pageContent.length) {
            pageContent = String(retry.content || "");
            if (!result) result = retry;
          }
        } catch {
          /* keep the first attempt */
        }
      }
      pageBodies.push(pageContent);
    }
    let content = pageBodies.join("\\n<!--PAGE-->\\n");`;

if (!s.includes(oldBlock)) { console.error("OLD BLOCK NOT FOUND"); process.exit(1); }
s = s.replace(oldBlock, newBlock);

// Replace the now-dead retry wrapper (it referenced `content` before definition).
const deadRetry = `    if (content.replace(/<!--PAGE-->/gi, "").trim().length < POLLINATIONS.MODELS.WEBSITE_MIN_TOTAL_CHARS || visibleWordCount(content) < POLLINATIONS.MODELS.WEBSITE_MIN_VISIBLE_WORDS) {
      try {
        const retry = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_RETRY, "Previous attempt was cut short`;
if (s.includes(deadRetry)) {
  const start = s.indexOf(deadRetry);
  const endMarker = `      } catch {
        /* keep first attempt */
      }
    }
`;
  const end = s.indexOf(endMarker, start);
  if (end === -1) { console.error("END NOT FOUND"); process.exit(1); }
  s = s.slice(0, start) + s.slice(end + endMarker.length);
}

// Fragments now come from the per-page bodies.
const oldFrag = `    const fragments = content.split(/<!--PAGE-->/i).map((s) => s.trim()).filter(Boolean);`;
const newFrag = `    const fragments = pageBodies.map((s) => String(s || "").trim()).filter(Boolean);`;
if (!s.includes(oldFrag)) { console.error("FRAG NOT FOUND"); process.exit(1); }
s = s.replace(oldFrag, newFrag);

writeFileSync(p, s, "utf8");
console.log("ok");

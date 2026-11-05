// Helpers to judge whether an AI-built website page contains real, *visible*
// content (not just a <style> block). A model that returns only CSS is a failed
// build — these helpers let the builders reject it, retry, or fall back to the
// content-rich template fragment so the shipped site is never empty.

// Remove everything that renders no text: <style>, <script> and comments.
export function stripInert(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

// Visible, human-readable text with tags and entities collapsed to spaces.
export function visibleText(html) {
  return stripInert(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function visibleWordCount(html) {
  const text = visibleText(html);
  return text ? text.split(" ").filter(Boolean).length : 0;
}

// A single page fragment counts as real when it has visible prose AND at least
// one heading. A CSS-only block has neither, so it fails and triggers the
// template fallback fragment (which always carries real copy).
export function hasRealContent(fragment, { minWords = 40 } = {}) {
  const raw = String(fragment || "");
  if (!/<h[1-6][\s>]/i.test(raw)) return false;
  return visibleWordCount(raw) >= minWords;
}

// Whole-document check used by WebsiteService.build(): the assembled shell always
// contributes nav + footer words, so require enough visible words that only a
// genuine multi-section page reaches the threshold. A CSS-only shell lands near
// the nav/footer word count and is rejected.
export function hasRichVisibleContent(html, { minWords = 70 } = {}) {
  if (!/<\/html>/i.test(String(html || ""))) return false;
  return visibleWordCount(html) >= minWords;
}

// Sections every generated page must contain. The Classic endpoint can cut a
// reply mid-page, which silently drops the trailing FAQ or contact form, so we
// check for them explicitly instead of only looking at the overall length.
// Returns an array of missing section names (empty when the page is complete).
export function missingPageSections(html, { requireForm = true } = {}) {
  const raw = String(html || "");
  const missing = [];
  if (!/<style[\s>]/i.test(raw)) missing.push("style");
  if (!/<img[\s>]/i.test(raw)) missing.push("image");
  if (!/<details[\s>]/i.test(raw)) missing.push("faq");
  if (requireForm && !/<form[\s>]/i.test(raw)) missing.push("form");
  return missing;
}

// Tags that never need closing.
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

// A page cut off mid-section by the token cap leaves dangling tags and a broken
// <img src="..." attribute. Close what is open and drop the incomplete trailing
// tag so the shipped page still renders instead of swallowing the rest of the
// document. Returns { html, repaired }.
export function repairTruncatedHtml(html) {
  const raw = String(html || "");
  if (!raw.trim()) return { html: raw, repaired: false };

  // 1. Drop a trailing partial tag (e.g. `<img src="https://...` with no ">").
  let working = raw.replace(/<[^<>]*$/, "");

  // 2. An unterminated attribute value inside the last tag: `<img src="http...`.
  const lastOpen = working.lastIndexOf("<");
  const lastClose = working.lastIndexOf(">");
  if (lastOpen > lastClose) {
    const tail = working.slice(lastOpen);
    if (/=\s*["'][^"']*$/.test(tail)) {
      working = working.slice(0, lastOpen).trimEnd();
    }
  }

  // 3. Close still-open elements, innermost first.
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let match;
  while ((match = tagRe.exec(working)) !== null) {
    const [full, closing, name, attrs] = match;
    const lower = name.toLowerCase();
    if (VOID_TAGS.has(lower) || attrs.trim().endsWith("/")) continue;
    if (closing) {
      const idx = stack.lastIndexOf(lower);
      if (idx === -1) continue;
      // Close anything left open inside it.
      for (let i = stack.length - 1; i > idx; i--) stack.pop();
      stack.pop();
    } else {
      stack.push(lower);
    }
  }

  let repaired = stack.length > 0;
  if (repaired) {
    for (let i = stack.length - 1; i >= 0; i--) working += "</" + stack[i] + ">";
  }
  return { html: working, repaired };
}

/**
 * Small, dependency-free publication guard for Website Studio output.
 *
 * The Studio accepts AI and user-authored HTML. That HTML is served on a
 * public URL, so it must not be able to run arbitrary scripts in our origin.
 * This is deliberately conservative: client sites retain semantic markup,
 * inline CSS, images, links and forms, while executable/embedded content is
 * removed and the known first-party runtime is added back.
 */

const EXECUTABLE_TAGS = /<(script|iframe|object|embed|applet|base)\b[^>]*>[\s\S]*?<\/\1\s*>|<(script|iframe|object|embed|applet|base)\b[^>]*\/?>/gi;
const EVENT_ATTRIBUTES = /\s+on[a-z0-9:_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const FORBIDDEN_ATTRIBUTES = /\s+(?:srcdoc|nonce|integrity|crossorigin)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const URL_ATTRIBUTE = /\s+(href|src|xlink:href|action|formaction|poster)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const RUNTIME_SRC = "/js/website-runtime.js";

function decodeForProtocolCheck(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);?/g, (_, number) => String.fromCodePoint(parseInt(number, 10)))
    .replace(/&(colon|tab|newline);?/gi, (_, entity) => ({ colon: ":", tab: "", newline: "" })[String(entity).toLowerCase()] || "")
    .replace(/[\u0000-\u001f\u007f\s]/g, "")
    .toLowerCase();
}

function unquote(value) {
  const raw = String(value || "").trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  return raw;
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeUrl(attribute, rawValue) {
  const value = unquote(rawValue).trim();
  if (!value) return "";
  const normalized = decodeForProtocolCheck(value);
  if (/^(javascript|vbscript|file|filesystem):/i.test(normalized)) return "";
  if (attribute === "action" || attribute === "formaction") return "";
  if (attribute === "src" || attribute === "poster") {
    if (/^data:/i.test(normalized) && !/^data:image\/(?:avif|gif|jpeg|jpg|png|svg\+xml|webp);/i.test(normalized)) return "";
    if (/^(https:|\/|\.\/|\.\.\/|data:image\/)/i.test(value)) return value;
    return "";
  }
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(value)) return value;
  return "";
}

function stripUnsafeCss(value) {
  return String(value || "")
    .replace(/@import\s+(?:url\()?[^;]+;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\s*\(\s*(['"]?)\s*(?:javascript|vbscript|data:(?!image\/)):[^)]*\)/gi, "url(about:blank)");
}

function addRuntime(html) {
  const withoutExistingRuntime = String(html || "").replace(new RegExp(`<script\\b[^>]*\\bsrc\\s*=\\s*["']${RUNTIME_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*><\\/script>`, "gi"), "");
  const runtime = `<script src="${RUNTIME_SRC}" defer></script>`;
  if (/<\/body\s*>/i.test(withoutExistingRuntime)) return withoutExistingRuntime.replace(/<\/body\s*>/i, `${runtime}</body>`);
  return `${withoutExistingRuntime}${runtime}`;
}

function ensureDocument(html) {
  const raw = String(html || "").trim();
  if (/<!doctype\b/i.test(raw) || /<html\b/i.test(raw)) return raw;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website</title></head><body>${raw}</body></html>`;
}

export function preparePublishedWebsiteHtml(html) {
  let safe = ensureDocument(html);
  safe = safe
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(EXECUTABLE_TAGS, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(EVENT_ATTRIBUTES, "")
    .replace(FORBIDDEN_ATTRIBUTES, "")
    .replace(/\s+srcset\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_, raw) => ` style="${escapeAttribute(stripUnsafeCss(unquote(raw)))}"`)
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => `<style>${stripUnsafeCss(css)}</style>`)
    .replace(URL_ATTRIBUTE, (_, attribute, raw) => {
      const value = safeUrl(String(attribute).toLowerCase(), raw);
      return value ? ` ${String(attribute).toLowerCase()}="${escapeAttribute(value)}"` : "";
    });
  return addRuntime(safe);
}


/**
 * Evidence-based checks for generated websites.
 *
 * These checks inspect the supplied HTML only. They intentionally do not make
 * performance, ranking, or network-security claims that browser markup cannot
 * verify.
 */
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

function addCheck(checks, id, label, passed, detail, priority = "medium") {
  checks.push({ id, label, passed: Boolean(passed), detail, priority });
}

export function inspectWebsiteHtml(html) {
  const source = String(html || "").trim();
  if (!source) {
    return {
      empty: true, score: null, passed: 0, total: 0, checks: [], priorities: [],
      summary: "Generate or open a website to review its markup readiness.",
    };
  }

  const doc = new DOMParser().parseFromString(source, "text/html");
  const checks = [];
  const title = cleanText(doc.querySelector("title")?.textContent);
  const description = cleanText(doc.querySelector('meta[name="description"]')?.getAttribute("content"));
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
  const headings = [...doc.querySelectorAll("h1")];
  const images = [...doc.querySelectorAll("img")];
  const links = [...doc.querySelectorAll("a[href]")];
  const buttons = [...doc.querySelectorAll("button, input[type=submit]")];
  const forms = [...doc.querySelectorAll("form")];
  const visibleText = cleanText(doc.body?.textContent);
  const contacts = links.filter((link) => /^(tel:|mailto:)/i.test(link.getAttribute("href") || ""));
  const ctas = [...links, ...buttons].filter((node) => /contact|quote|book|call|start|learn|schedule|get\s+in\s+touch/i.test(cleanText(node.textContent || node.getAttribute("value"))));
  const missingAlt = images.filter((image) => !cleanText(image.getAttribute("alt"))).length;
  const unsafeMarkup = /<script\b|\bon\w+\s*=|javascript\s*:/i.test(source);
  const httpAssets = [...doc.querySelectorAll("img[src], link[href]")]
    .filter((node) => /^http:\/\//i.test(node.getAttribute(node.tagName === "LINK" ? "href" : "src") || ""));

  addCheck(checks, "title", "Descriptive page title", title.length >= 10, title ? `Found: ${title.slice(0, 90)}` : "Add a concise, business-specific title.", "high");
  addCheck(checks, "description", "Meta description", description.length >= 40, description ? `Found ${description.length} characters.` : "Add a clear description for search results and shares.");
  addCheck(checks, "viewport", "Mobile viewport tag", /width\s*=\s*device-width/i.test(viewport), viewport ? "Viewport markup is present." : "Add a responsive viewport tag.", "high");
  addCheck(checks, "heading", "Clear primary heading", headings.length === 1 && cleanText(headings[0]?.textContent).length > 3, headings.length ? `Found ${headings.length} H1 heading${headings.length === 1 ? "" : "s"}.` : "Use one meaningful H1 for the main page.", "high");
  addCheck(checks, "content", "Useful visible content", visibleText.length >= 280, `${visibleText.length} visible characters detected.`);
  addCheck(checks, "cta", "Visible next step", ctas.length > 0, ctas.length ? `${ctas.length} contact, booking, or enquiry action${ctas.length === 1 ? "" : "s"} detected.` : "Add a visible contact, booking, or quote action.", "high");
  addCheck(checks, "contact", "Contact method in markup", contacts.length > 0, contacts.length ? `${contacts.length} phone or email link${contacts.length === 1 ? "" : "s"} detected.` : "Add a verified phone or email link when available.");
  addCheck(checks, "images", "Image alt text", missingAlt === 0, images.length ? (missingAlt ? `${missingAlt} of ${images.length} image${images.length === 1 ? "" : "s"} need alt text.` : `Alt text found for all ${images.length} image${images.length === 1 ? "" : "s"}.`) : "No images were found; add relevant, licensed visuals if useful.", "low");
  addCheck(checks, "forms", "Form delivery configuration", forms.length === 0 || forms.every((form) => cleanText(form.getAttribute("action"))), forms.length ? (forms.every((form) => cleanText(form.getAttribute("action"))) ? "Every form has an action configured." : "A form needs a configured delivery endpoint before it can send.") : "No form markup found.");
  addCheck(checks, "assets", "Secure external asset URLs", httpAssets.length === 0, httpAssets.length ? `${httpAssets.length} external asset${httpAssets.length === 1 ? " uses" : "s use"} HTTP.` : "No HTTP external assets detected.", "low");
  addCheck(checks, "markup", "Safe published markup", !unsafeMarkup, unsafeMarkup ? "Unsafe scripts, event handlers, or JavaScript URLs were detected in this draft." : "No obvious inline executable markup detected.", "high");

  const applicable = checks.filter((check) => check.id !== "images" || images.length > 0);
  const passed = applicable.filter((check) => check.passed).length;
  const total = applicable.length;
  const score = total ? Math.round((passed / total) * 100) : null;
  return {
    empty: false,
    score,
    passed,
    total,
    checks,
    priorities: checks.filter((check) => !check.passed && check.priority !== "low").slice(0, 4),
    summary: `${passed} of ${total} markup readiness checks currently pass. This is not a speed, SEO-rank, or security scan.`,
  };
}

export function qualityMarkup(report) {
  if (!report || report.empty) return '<div class="site-quality__empty">Generate or open a website to review its markup readiness.</div>';
  const checks = report.checks.map((check) => `<li class="site-quality__item ${check.passed ? "is-pass" : "is-action"}"><span class="site-quality__icon" aria-hidden="true">${check.passed ? "✓" : "!"}</span><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small></span></li>`).join("");
  return `<div class="site-quality__summary"><span class="site-quality__score">${report.score}%</span><span><strong>Markup readiness</strong><small>${escapeHtml(report.summary)}</small></span></div><ul class="site-quality__list">${checks}</ul>`;
}

export function qualityText(report) {
  if (!report || report.empty) return "No website HTML is available for a markup-readiness review.";
  const actions = report.priorities.length ? report.priorities.map((check) => `- ${check.label}: ${check.detail}`).join("\n") : "- All high and medium-priority markup checks currently pass.";
  return `Markup readiness: ${report.score}% (${report.passed}/${report.total})\n${report.summary}\n\nRecommended actions:\n${actions}`;
}

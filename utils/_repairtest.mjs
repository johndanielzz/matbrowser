import { missingPageSections, repairTruncatedHtml, hasRichVisibleContent, visibleWordCount } from "../server/utils/siteContent.js";
import { PollinationsService } from "../server/services/pollinationsService.js";

const svc = new PollinationsService();
const lead = { name: "ACME Roofing", businessType: "Roofing Contractor", address: "12 Allen Ave, Lagos", phone: "+2348012345678", email: "a@b.ng" };
for (const [spec, isHome] of [[{ id: "home", title: "Home", focus: "headline" }, true], [{ id: "about", title: "About", focus: "story" }, false]]) {
  const frag = svc.fallbackPageFragment(spec, lead, "https://picsum.photos/seed/x/1600/900", [], isHome, "modern");
  const missing = missingPageSections(frag);
  console.log((missing.length === 0 ? "PASS" : "FAIL") + "  fallback " + spec.id + "  missing=" + JSON.stringify(missing) + "  len=" + frag.length);
}
const doc = svc.assembleMultiPage(
  [{ title: "Home", body: svc.fallbackPageFragment({ id: "home", title: "Home", focus: "x" }, lead, "h", [], true, "modern") }],
  "ACME Roofing", "#22c55e", "modern");
console.log((/<\/html>/i.test(doc) ? "PASS" : "FAIL") + "  fallback doc closed");
console.log((/<form/i.test(doc) && /<details/i.test(doc) ? "PASS" : "FAIL") + "  fallback doc has form+faq");

import { writeFileSync, readFileSync } from "node:fs";

const cases = [
  ['<div class="a"><p>hi</p>', "dangling div"],
  ['<img src="https://x.test/a.png" alt="a"><div><span>', "dangling span + img"],
  ['<section><p>text<img src="https://x.test/very/long/pat', "truncated attribute"],
  ['<div><p>ok</p></div>', "balanced"],
  ['<br><hr><img src="a">', "void tags"],
];
let fail = 0;
for (const [input, label] of cases) {
  const r = repairTruncatedHtml(input);
  const ok = /<\/div>|<\/span>|<\/section>/.test(r.html) || label === "balanced" || label === "void tags";
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(r.html) + "  repaired=" + r.repaired);
  if (!ok) fail++;
}

// Balance check on the generated site.
const file = process.argv[2];
if (file) {
  const html = readFileSync(file, "utf8");
  const VOID = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, closing, name, attrs] = m;
    const lower = name.toLowerCase();
    if (VOID.has(lower) || attrs.trim().endsWith("/")) continue;
    if (closing) {
      const i = stack.lastIndexOf(lower);
      if (i === -1) { console.log("FAIL  stray </" + lower + ">"); fail++; }
      else { stack.length = i; }
    } else stack.push(lower);
  }
  console.log((stack.length === 0 ? "PASS" : "FAIL") + "  balanced tags  unclosed=" + JSON.stringify(stack));
  if (stack.length) fail++;
  console.log((/<!--PAGE-->/.test(html) ? "FAIL" : "PASS") + "  no page markers");
  console.log((/\[PAGE/i.test(html) ? "FAIL" : "PASS") + "  no [PAGE tokens");
  console.log((/```/.test(html) ? "FAIL" : "PASS") + "  no markdown fences");
  console.log((hasRichVisibleContent(html) ? "PASS" : "FAIL") + "  rich visible content  words=" + visibleWordCount(html));
  console.log((/<form/i.test(html) ? "PASS" : "FAIL") + "  has form");
  console.log((/<details/i.test(html) ? "PASS" : "FAIL") + "  has details");
}
console.log(fail === 0 ? "ALL PASS" : fail + " FAILURES");

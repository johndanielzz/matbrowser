import fs from "node:fs";

const LOG = "E:/jjjjjj/logs/_aeo-check.txt";
const base = "http://localhost:3111";
const out = [];
const log = (s) => { out.push(String(s)); fs.writeFileSync(LOG, out.join("\n") + "\n"); };
const strip = (html) => html
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ");
const lds = (html) => {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try { blocks.push(JSON.parse(m[1])); }
    catch (e) { blocks.push({ __parseError: e.message }); }
  }
  return blocks;
};
const get = async (path) => {
  try {
    const r = await fetch(base + path);
    return { status: r.status, text: await r.text() };
  } catch (e) { return { status: 0, text: "FETCH ERROR: " + e.message }; }
};

let fails = 0;
const check = (label, cond, detail) => {
  log((cond ? "PASS " : "FAIL ") + label + (detail ? " :: " + detail : ""));
  if (!cond) fails++;
};

try {
  const robots = await get("/robots.txt");
  check("robots status 200", robots.status === 200, "status=" + robots.status);
  for (const ua of ["GPTBot", "PerplexityBot", "Google-Extended", "ClaudeBot", "ChatGPT-User", "CCBot"]) {
    check("robots allows " + ua, robots.text.includes("User-agent: " + ua));
  }
  check("robots has sitemap line", robots.text.includes("Sitemap: https://www.mat-leads.world/sitemap.xml"));

  const sm = await get("/sitemap.xml");
  check("sitemap status 200", sm.status === 200, "status=" + sm.status);
  check("sitemap no example.com", !sm.text.includes("matleads.example.com"));
  check("sitemap all mat-leads.world", !/<loc>(?!https:\/\/www\.mat-leads\.world)/.test(sm.text));
  check("sitemap has faq + features", sm.text.includes("/faq.html") && sm.text.includes("/features/phone-lead-generation") && sm.text.includes("/features/ai-website-builder"));
  const urlCount = (sm.text.match(/<url>/g) || []).length;
  check("sitemap url count 27", urlCount === 27, "count=" + urlCount);

  const home = await get("/");
  check("home status 200", home.status === 200, "status=" + home.status);
  const homeLds = lds(home.text);
  check("home JSON-LD parses", homeLds.length > 0 && homeLds.every((l) => !l.__parseError), homeLds.map((l) => l.__parseError).filter(Boolean).join("; "));
  const homeText = strip(home.text);
  const sa = homeLds.find((l) => l["@type"] === "SoftwareApplication");
  check("home SoftwareApplication", !!sa);
  check("home offers >= 5", sa && Array.isArray(sa.offers) && sa.offers.length >= 5, sa ? "offers=" + (sa.offers.length || 0) : "");
  check("home offer prices", sa && ["29", "99", "149", "249"].every((p) => sa.offers.some((o) => o.price === p)));
  check("home creator Ebube", sa && sa.creator && sa.creator.name === "Ebube John Okoye");
  const homeFaq = homeLds.find((l) => l["@type"] === "FAQPage");
  check("home FAQPage present", !!homeFaq);
  if (homeFaq) {
    let match = 0;
    for (const q of homeFaq.mainEntity) {
      const qOk = homeText.includes(q.name);
      const aOk = homeText.includes(q.acceptedAnswer.text);
      if (qOk && aOk) match++;
      else log("  mismatch: " + q.name.slice(0, 50) + (qOk ? "" : " [Q missing]") + (aOk ? "" : " [A missing]"));
    }
    check("home FAQ json matches visible", match === homeFaq.mainEntity.length, match + "/" + homeFaq.mainEntity.length);
  }
  check("home has How It Works + 4 steps", homeText.includes("How It Works") && home.text.includes("Step 4: Build the site and close"));

  const faq = await get("/faq.html");
  check("faq status 200", faq.status === 200, "status=" + faq.status);
  const faqLds = lds(faq.text);
  check("faq JSON-LD parses", faqLds.length > 0 && faqLds.every((l) => !l.__parseError), faqLds.map((l) => l.__parseError).filter(Boolean).join("; "));
  const faqFaq = faqLds.find((l) => l["@type"] === "FAQPage");
  check("faq FAQPage 12 questions", faqFaq && faqFaq.mainEntity.length === 12, faqFaq ? "q=" + faqFaq.mainEntity.length : "missing");
  const faqText = strip(faq.text);
  const faqDetails = (faq.text.match(/<details class="faq-item"/g) || []).length;
  check("faq visible details 12", faqDetails === 12, "details=" + faqDetails);
  if (faqFaq) {
    let match = 0;
    for (const q of faqFaq.mainEntity) {
      if (faqText.includes(q.name) && faqText.includes(q.acceptedAnswer.text)) match++;
      else log("  faq mismatch: " + q.name.slice(0, 60));
    }
    check("faq json matches visible", match === faqFaq.mainEntity.length, match + "/" + faqFaq.mainEntity.length);
  }
  check("faq canonical", faq.text.includes('href="https://www.mat-leads.world/faq.html"'));

  for (const pair of [["/features/phone-lead-generation", "phone"], ["/features/ai-website-builder", "builder"]]) {
    const path = pair[0], name = pair[1];
    const p = await get(path);
    check(name + " status 200", p.status === 200, "status=" + p.status);
    const pLds = lds(p.text);
    check(name + " JSON-LD parses", pLds.length > 0 && pLds.every((l) => !l.__parseError), pLds.map((l) => l.__parseError).filter(Boolean).join("; "));
    const graph = pLds.find((l) => l["@graph"]);
    check(name + " BreadcrumbList", graph && graph["@graph"].some((g) => g["@type"] === "BreadcrumbList"));
    const pFaq = graph && graph["@graph"].find((g) => g["@type"] === "FAQPage");
    const pText = strip(p.text);
    check(name + " FAQPage 3 questions", pFaq && pFaq.mainEntity.length === 3, pFaq ? "q=" + pFaq.mainEntity.length : "missing");
    if (pFaq) {
      let match = 0;
      for (const q of pFaq.mainEntity) {
        if (pText.includes(q.name) && pText.includes(q.acceptedAnswer.text)) match++;
        else log("  " + name + " mismatch: " + q.name.slice(0, 60));
      }
      check(name + " FAQ json matches visible", match === pFaq.mainEntity.length, match + "/" + pFaq.mainEntity.length);
    }
    check(name + " has H1", /<h1>/.test(p.text));
    check(name + " has >=4 H2s", (p.text.match(/<h2>/g) || []).length >= 4, "h2=" + (p.text.match(/<h2>/g) || []).length);
    check(name + " canonical extensionless", p.text.includes('rel="canonical" href="https://www.mat-leads.world' + path + '"'));
  }

  const pricing = await get("/pricing.html");
  check("pricing status 200", pricing.status === 200, "status=" + pricing.status);
  check("pricing canonical fixed", pricing.text.includes('href="https://www.mat-leads.world/pricing.html"'));
  check("pricing no example.com", !pricing.text.includes("matleads.example.com"));
  const prLds = lds(pricing.text);
  check("pricing JSON parses", prLds.length > 0 && prLds.every((l) => !l.__parseError), prLds.map((l) => l.__parseError).filter(Boolean).join("; "));
  const itemList = prLds.find((l) => l["@type"] === "ItemList");
  check("pricing ItemList 5 plans", itemList && itemList.itemListElement.length === 5, itemList ? "n=" + itemList.itemListElement.length : "missing");

  const fp = await get("/forgot-password.html");
  check("forgot-password status 200", fp.status === 200, "status=" + fp.status);

  const layout = fs.readFileSync("E:/jjjjjj/components/layout.js", "utf8");
  check("nav has FAQ link", layout.includes('href="/faq.html"'));
  check("nav has Features link", layout.includes('href="/features/phone-lead-generation"'));

  const css = await get("/css/style.css");
  check("css 200 + faq styles", css.status === 200 && css.text.includes("details.faq-item"), "status=" + css.status);

  log(fails === 0 ? "ALL PASS" : "FAILURES=" + fails);
  log("DONE");
} catch (e) {
  log("ERROR: " + e.message);
  log("DONE");
}
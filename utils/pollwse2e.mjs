import { writeFileSync } from "node:fs";
import { WebsiteService } from "../server/services/websiteService.js";

const out = process.argv[2] || "logs/_wse2e.txt";
const lines = [];
const svc = new WebsiteService();
const lead = {
  name: "ACME Roofing",
  businessType: "Roofing Contractor",
  address: "12 Allen Avenue, Ikeja, Lagos",
  phone: "+2348012345678",
  email: "hello@acmeroofing.ng",
};

async function run(label, options) {
  const started = Date.now();
  try {
    const r = await svc.build({ lead, options });
    const rec = r.website || r;
    const html = String(rec.html || "");
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
    lines.push(label + " OK " + (Date.now() - started + "ms").padEnd(9) + "provider=" + String(rec.provider).padEnd(12) +
      "model=" + String(rec.model).padEnd(14) + "len=" + String(html.length).padEnd(7) + "pages=" + String(rec.pageCount).padEnd(3) +
      " w=" + String(text.split(/\s+/).filter(Boolean).length).padEnd(5) +
      " style=" + (html.match(/<style/gi) || []).length + " img=" + String((html.match(/<img/gi) || []).length).padEnd(3) +
      " det=" + String((html.match(/<details/gi) || []).length).padEnd(3) + " form=" + String((html.match(/<form/gi) || []).length).padEnd(3) +
      " doctype=" + /<!doctype/i.test(html) + " closed=" + /<\/html>/i.test(html) +
      (rec.aiError ? " aiError=" + String(rec.aiError).slice(0, 160) : ""));
    writeFileSync(out, lines.join("\n"), "utf8");
    return html;
  } catch (e) {
    lines.push(label + " FAIL " + (Date.now() - started + "ms").padEnd(9) + "code=" + String(e?.code || "-") + " msg=" + String(e?.message || e).slice(0, 300));
    writeFileSync(out, lines.join("\n"), "utf8");
    return "";
  }
}

const pages = Number(process.argv[3] || 1);
const html = await run("[ws " + pages + "p]", { pages, style: "modern", palette: "emerald" });
if (html) writeFileSync(out + ".html", html, "utf8");
writeFileSync(out, lines.join("\n"), "utf8");
console.log(lines.join("\n"));

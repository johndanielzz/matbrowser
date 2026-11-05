import { writeFileSync } from "node:fs";
import { PollinationsService } from "../server/services/pollinationsService.js";

const out = process.argv[2] || "logs/_e2e.txt";
const lines = [];
const svc = new PollinationsService();
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
    const r = await svc.buildWebsite(lead, options);
    const html = String(r.html || "");
    const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    lines.push(label + " OK " + (Date.now() - started + "ms").padEnd(9) + "model=" + String(r.model).padEnd(22) + "len=" + String(html.length).padEnd(7) + "pages=" + r.pageCount +
      " w=" + String(words).padEnd(5) + " style=" + (html.match(/<style/gi) || []).length + " img=" + String((html.match(/<img/gi) || []).length).padEnd(3) +
      " det=" + String((html.match(/<details/gi) || []).length).padEnd(3) + " form=" + String((html.match(/<form/gi) || []).length).padEnd(3) +
      " picsum=" + (html.match(/picsum/gi) || []).length + " fence=" + (html.match(/```/g) || []).length +
      " doctype=" + /<!doctype/i.test(html) + " emptyImg=" + /src\s*=\s*["']\s*["']/i.test(html) +
      " usage=" + JSON.stringify(r.usage) + " fr=" + String(r.finishReason || "-"));
    writeFileSync(out, lines.join("\n"), "utf8");
    return html;
  } catch (e) {
    lines.push(label + " FAIL " + (Date.now() - started + "ms").padEnd(9) + "code=" + String(e?.code || "-") + " msg=" + String(e?.message || e).slice(0, 260));
    writeFileSync(out, lines.join("\n"), "utf8");
    return "";
  }
}

const html = await run("[1p modern]", { pages: 1, style: "modern", palette: "emerald" });
if (html) {
  writeFileSync(out + ".html", html, "utf8");
  lines.push("wrote " + out + ".html (" + html.length + " chars)");
}
const pages = Number(process.argv[3] || 0);
if (pages > 1) {
  const h2 = await run("[" + pages + "p modern]", { pages, style: "modern", palette: "emerald" });
  if (h2) writeFileSync(out + "." + pages + "p.html", h2, "utf8");
}
writeFileSync(out, lines.join("\n"), "utf8");
console.log(lines.join("\n"));

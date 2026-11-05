import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

// 1. Remove the stale duplicated comment block left from the previous patch.
const dup = `    // Compact prompt: the Classic endpoint caps a reply at ~1500 tokens, so the
    // old multi-paragraph brief pushed the model into finish_reason "length"
    // and truncated pages mid-section. Ask for one page with a fixed,
    // compact section list instead.
`;
if (!s.includes(dup)) { console.error("DUP ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(dup, "");

// 2. Shorten the per-page focus strings. The long original ("... gallery image
//    row, sample testimonial band ...") made the model emit a seventh "gallery"
//    section, which is what pushed the reply past Classic's token cap.
const specsOld = `    const allSpecs = [
      { id: "home", title: "Home", focus: "hero band with headline + dual CTA, trust-signal strip, 3-4 card highlights grid, gallery image row, sample testimonial band, FAQ accordion, closing CTA band" },
      { id: "about", title: "About", focus: "brand story, why-choose-us cards, values list, process steps (contact > quote > work > support), commitment note" },
      { id: "services", title: "Services", focus: "4-6 service cards with benefit copy, simple packages/pricing row, FAQ, closing CTA band" },
      { id: "contact", title: "Contact", focus: "click-to-call + message CTA buttons, contact form (name, email, message), address, hours, map placeholder, FAQ" }
    ];`;
const specsNew = `    // Keep each focus SHORT. A long focus listing extra bands (gallery,
    // testimonial, pricing...) made the model append a seventh section, which
    // pushed the reply past Classic's ~1500 token cap.
    const allSpecs = [
      { id: "home", title: "Home", focus: "headline and CTAs for this business" },
      { id: "about", title: "About", focus: "the business story and why choose us" },
      { id: "services", title: "Services", focus: "the services this business offers" },
      { id: "contact", title: "Contact", focus: "how to reach and contact this business" }
    ];`;
if (!s.includes(specsOld)) { console.error("SPECS ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(specsOld, specsNew);

// 3. Forbid extra sections explicitly and drop the now-unused layout verbosity.
const oldStruct = `        + "Use the image URLs given. No markdown, no explanation, no html/head/body/nav, no <!--PAGE--> marker. "
        + "Be brief so the page fits in 900 tokens. Finish every section." + tone;`;
const newStruct = `        + "Use the image URLs given. Add NO other sections (no gallery, no testimonials, no pricing, no extra lists) and no second <style> block. "
        + "No markdown, no explanation, no html/head/body/nav, no <!--PAGE--> marker. "
        + "Be brief so the page fits in 900 tokens. Finish every section." + tone;`;
if (!s.includes(oldStruct)) { console.error("STRUCT ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(oldStruct, newStruct);

writeFileSync(p, s, "utf8");
console.log("ok");

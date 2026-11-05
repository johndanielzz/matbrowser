import { readFileSync, writeFileSync } from "node:fs";
const p = "api/services/pollinationsService.js";
let s = readFileSync(p, "utf8");

const old = `    if (isHome) {
      return "<div class=\\"hero-band\\"><span class=\\"kick\\">" + type + "</span><h1>" + name + " — quality service you can trust</h1><p class=\\"lead\\">" + address + " Call today for a free quote.</p><div class=\\"cta-row\\"><a class=\\"btn btn-p\\" href=\\"tel:" + phone + "\\">Call now</a><a class=\\"btn btn-g\\" href=\\"#quote\\">Get a free quote</a></div></div><img src=\\"" + hero + "\\" alt=\\"" + name + "\\" loading=\\"lazy\\" style=\\"width:100%;max-height:420px;object-fit:cover;display:block;border-radius:16px\\"><div class=\\"trust\\"><span><b>Local</b> & trusted</span><span><b>Fast</b> response</span><span><b>Fair</b> pricing</span></div><h1>" + name + " — " + type + "</h1><p>" + address + "</p><p>Phone: " + phone + "</p><p>Email: " + email + "</p><button>Get a Free Quote</button>" + card("Services", "What we do");
    }
    return "<h1>" + spec.title + "</h1><p>" + spec.focus + "</p>";`;

const neu = `    // The fallback must carry every section the AI pages are asked for, so a
    // failed page still ships a usable site instead of a bare heading.
    const style = "<style>.fb-hero{display:grid;gap:10px;padding:18px 0}.fb-stats{display:flex;gap:18px;flex-wrap:wrap;padding:16px 0}.fb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;padding:14px 0}.fb-faq{padding:14px 0}.fb-form{display:grid;gap:10px;max-width:520px;padding:14px 0}</style>";
    const stats = "<div class=\\"fb-stats\\"><div><b>10+</b><br>Years serving the area</div><div><b>500+</b><br>Jobs completed</div><div><b>4.9</b><br>Average rating</div><div><b>24h</b><br>Response time</div></div>";
    const cards = "<div class=\\"fb-cards\\">" + card("Quality work", "Every job finished to a high standard.") + card("Fair pricing", "Clear quotes with no hidden extras.") + card("Local team", "We are based right here in the community.") + "</div>";
    const faq = "<div class=\\"fb-faq\\"><h2>Frequently asked questions</h2><details><summary>Do you offer free quotes?</summary><p>Yes, we provide a free quote for every job.</p></details><details><summary>How soon can you start?</summary><p>Most jobs start within a few days of booking.</p></details><details><summary>Do you guarantee the work?</summary><p>Yes, all work is backed by our guarantee.</p></details></div>";
    const form = "<form class=\\"fb-form\\" id=\\"quote\\"><h2>Request a free quote</h2><input type=\\"text\\" name=\\"name\\" placeholder=\\"Your name\\" required><input type=\\"email\\" name=\\"email\\" placeholder=\\"Your email\\" required><input type=\\"tel\\" name=\\"phone\\" placeholder=\\"Your phone\\"><textarea name=\\"message\\" rows=\\"4\\" placeholder=\\"How can we help?\\"></textarea><button type=\\"submit\\">Send Request</button></form>";
    if (isHome) {
      return style + "<div class=\\"fb-hero\\"><span class=\\"kick\\">" + type + "</span><h1>" + name + " — quality service you can trust</h1><p class=\\"lead\\">" + address + " Call today for a free quote.</p><div class=\\"cta-row\\"><a class=\\"btn btn-p\\" href=\\"tel:" + phone + "\\">Call now</a><a class=\\"btn btn-g\\" href=\\"#quote\\">Get a free quote</a></div></div><img src=\\"" + hero + "\\" alt=\\"" + name + "\\" loading=\\"lazy\\" style=\\"width:100%;max-height:420px;object-fit:cover;display:block;border-radius:16px\\">" + stats + cards + faq + form;
    }
    return style + "<h1>" + spec.title + "</h1><p>" + spec.focus + "</p><img src=\\"" + hero + "\\" alt=\\"" + name + " — " + spec.title + "\\" loading=\\"lazy\\" style=\\"width:100%;max-height:380px;object-fit:cover;display:block;border-radius:16px\\">" + stats + cards + faq + form;`;

if (!s.includes(old)) { console.error("FALLBACK ANCHOR NOT FOUND"); process.exit(1); }
s = s.replace(old, neu);
writeFileSync(p, s, "utf8");
console.log("ok");

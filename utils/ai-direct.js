// Direct AI method test — isolates nvidiaService from HTTP routing.
import { NvidiaService } from "../server/services/nvidiaService.js";
import fs from "node:fs";

const s = new NvidiaService();
const lead = {
  name: "Bright Smiles Dental",
  businessType: "dentist",
  address: "12 Main St, Austin, TX",
  phone: "+1 512 555 0142",
  email: "office@brightsmiles.example",
  rating: 4.6,
  reviewsCount: 128,
  opportunityScore: 78,
  audit: { checks: { mobile: false, ssl: false, contactForm: false } },
  source: "osm"
};
const out = [];
const log = (l, r) => out.push(`\n=== ${l} === status=${r.status ?? "-"} ${r.ms}ms\n` + JSON.stringify(r.body ?? r.err).slice(0, 700));
async function run(label, fn) {
  const t = Date.now();
  try {
    const r = await fn();
    log(label, { ms: Date.now() - t, body: { model: r.model, content: String(r.content || "").slice(0, 500) } });
  } catch (e) {
    log(label, { ms: Date.now() - t, err: { status: e.status, code: e.code, message: e.message } });
  }
}

await run("analyzeLead", () => s.analyzeLead(lead));
await run("writeOutreach", () => s.writeOutreach(lead, "cold_email"));
await run("proposalPack", () => s.proposalPack(lead, "pro_site"));
await run("tycoonChat", () => s.tycoonChat("How do I close a $999 website deal over WhatsApp?", { lead }));
await run("chat", () => s.chat("Say hello in 5 words."));

fs.writeFileSync("logs/_ai-direct.txt", out.join("\n"), "utf8");
console.log("done");

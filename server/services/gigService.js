import { randomUUID } from "node:crypto";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";

const memGigs = new Map();

const STARTER_GIGS = [
  { title: "Do 10 WhatsApp follow-ups for a bakery", payUsd: 25, level: "Beginner", description: "Use Outreach Studio script, screenshot replies." },
  { title: "Build 5-page Studio website for a salon", payUsd: 120, level: "Intermediate", description: "Use Website Studio template + business content." },
  { title: "Write 3 proposals with pay links", payUsd: 45, level: "Beginner", description: "Use Proposal Closer + invoice." }
];

export class GigService {
  constructor(earnService) {
    this.gigs = new FirestoreRepository("gigs");
    this.earnService = earnService;
    this.seeded = false;
  }
  async seedIfEmpty(user) {
    if (this.seeded) return;
    this.seeded = true;
    try {
      const existing = await this.gigs.list({ limit: 3 });
      if (existing.length) return;
      for (const g of STARTER_GIGS) {
        await this.gigs.create({ id: randomUUID(), title: g.title, payCents: g.payUsd * 100, level: g.level, description: g.description, status: "open", ownerUid: user?.uid || "system", createdAt: new Date().toISOString() });
      }
    } catch {}
  }
  async list(user) {
    await this.seedIfEmpty(user);
    try {
      const rows = await this.gigs.list({ limit: 100 });
      if (rows.length) return rows;
    } catch {}
    return [...memGigs.values()];
  }
  async create(user, input = {}) {
    const gig = { id: randomUUID(), title: String(input.title || "Untitled gig").slice(0, 160), payCents: Math.round(Number(input.payUsd || 0) * 100), level: String(input.level || "Beginner").slice(0, 40), description: String(input.description || "").slice(0, 1000), status: "open", ownerUid: user.uid, createdAt: new Date().toISOString() };
    if (!gig.payCents || gig.payCents < 500) { const e = new Error("Minimum gig pay is $5."); e.status = 422; throw e; }
    try { await this.gigs.upsert(gig.id, gig); } catch {}
    memGigs.set(gig.id, gig);
    return { gig };
  }
  async claim(user, id) {
    let gig = null;
    try { gig = await this.gigs.findById(id); } catch {}
    gig = gig || memGigs.get(id);
    if (!gig) { const e = new Error("Gig not found."); e.status = 404; throw e; }
    const updated = { ...gig, status: `claimed by ${user.email || user.uid}`, claimedBy: user.uid, claimedAt: new Date().toISOString() };
    try { await this.gigs.upsert(id, updated); } catch {}
    memGigs.set(id, updated);
    let invoice = null;
    try { invoice = (await this.earnService.createInvoice(user, { offerKey: "custom", amountUsd: updated.payCents / 100, leadName: updated.title, notes: `Gig: ${updated.title}` })).invoice; } catch {}
    return { gig: updated, invoice };
  }
}

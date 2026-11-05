import { randomUUID } from "node:crypto";
import { clientOfferCatalog, referralCommissionForPlan } from "../config/plans.js";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { isAdminUser } from "../utils/entitlements.js";
import { AppError } from "../utils/errors.js";

const memReferrals = new Map();
const memInvoices = new Map();
const memPayouts = [];
// code slug -> uid, minted whenever a user opens the Earn page (fast referrer lookup).
const referralCodeRegistry = new Map();

const REFERRAL_SEARCH_CREDITS = 2;

function normalizedPaymentUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? raw.slice(0, 2000) : "";
  } catch {
    return "";
  }
}

function codeFor(emailOrUid) {
  return String(emailOrUid || "ref").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10).padEnd(4, "x");
}

export class EarnService {
  constructor() {
    this.users = new FirestoreRepository("users");
    this.referrals = new FirestoreRepository("referrals");
    this.invoices = new FirestoreRepository("invoices");
    this.payouts = new FirestoreRepository("payouts");
  }
  referralCodeFor(user) {
    const base = codeFor(user?.uid || user?.email);
    try { if (user?.uid || user?.id) referralCodeRegistry.set(base, user.uid || user.id); } catch {}
    return `MAT-${base.toUpperCase()}-30`;
  }
  offers() {
    return clientOfferCatalog;
  }
  async myReferral(user) {
    const code = this.referralCodeFor(user);
    let rows = [];
    try {
      rows = await this.referrals.list({ limit: 200, where: [{ field: "referrerUid", op: "==", value: user.uid }] });
    } catch {
      rows = [...memReferrals.values()].filter((r) => r.referrerUid === user.uid);
    }
    const codeRows = [...memReferrals.values()].filter((r) => r.referrerCode === code);
    const all = [...rows, ...codeRows.filter((r) => !rows.find((x) => x.id === r.id))];
    const paidCents = all.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.commissionCents || 0), 0);
    const pendingCents = all.filter((r) => r.status !== "paid").reduce((s, r) => s + Number(r.commissionCents || 0), 0);
    return { code, linkPath: `/signup.html?ref=${encodeURIComponent(code)}`, rows: all, paidCents, pendingCents };
  }
  async trackSignup(referredUser, refCode) {
    if (!refCode || !referredUser?.uid) return null;
    const code = String(refCode).toUpperCase();

    // Idempotent — the same referred account never awards twice (register-time
    // pending award, verify-time award and legacy track-signup can all fire).
    let existing = null;
    try {
      const rows = await this.referrals.list({ limit: 200, where: [{ field: "referredUid", op: "==", value: referredUser.uid }] });
      existing = rows.find((row) => row.referrerCode === code) || null;
    } catch {
      existing = [...memReferrals.values()].find((row) => row.referredUid === referredUser.uid && row.referrerCode === code) || null;
    }
    if (existing) return existing;

    const referrer = await this.resolveReferrer(code);
    const record = {
      id: randomUUID(),
      referrerUid: referrer?.uid || referrer?.id || "",
      referrerCode: code,
      referredUid: referredUser.uid,
      referredEmail: referredUser.email || "",
      plan: "trial",
      amountCents: 0,
      commissionCents: 0,
      status: "signup",
      searchCreditsAwarded: referrer ? REFERRAL_SEARCH_CREDITS : 0,
      createdAt: new Date().toISOString()
    };
    try { await this.referrals.create(record); } catch {}
    memReferrals.set(record.id, record);

    if (referrer) await this.awardSearchCredits(referrer, REFERRAL_SEARCH_CREDITS);
    return record;
  }

  async resolveReferrer(refCode) {
    const slug = String(refCode || "").toLowerCase().replace(/^mat-/, "").replace(/-\d+$/, "");
    if (!slug) return null;

    // Fast path: code minted when the referrer opened the Earn page.
    const mintedUid = referralCodeRegistry.get(slug);
    if (mintedUid) {
      try {
        const found = await this.users.findById(mintedUid);
        if (found) return found;
      } catch {}
    }

    // Derive from stored accounts — codes are codeFor(uid) or codeFor(email).
    try {
      const users = await this.users.list({ limit: 1000 });
      const match = users.find((user) =>
        codeFor(user.uid || user.id).toLowerCase() === slug || codeFor(user.email).toLowerCase() === slug
      );
      if (match) return match;
    } catch {}
    return null;
  }

  async awardSearchCredits(referrer, credits) {
    const uid = referrer?.uid || referrer?.id;
    if (!uid || !credits) return;
    try {
      const current = Math.max(0, Number(referrer.bonusSearchCredits || 0));
      await this.users.upsert(uid, {
        bonusSearchCredits: current + credits,
        lastSearchCreditAwardAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn(`[earn] search credit award failed for ${uid}: ${error?.message || error}`);
    }
  }
  async rewardForPaidUser(paidUser) {
    let rows = [];
    try {
      rows = await this.referrals.list({ limit: 50, where: [{ field: "referredUid", op: "==", value: paidUser.uid }] });
    } catch {
      rows = [...memReferrals.values()].filter((r) => r.referredUid === paidUser.uid);
    }
    const open = rows.find((r) => r.status === "signup");
    if (!open) return null;
    const planKey = paidUser.subscription || paidUser?.entitlements?.activePlan || "professional";
    const pct = referralCommissionForPlan(planKey);
    const planPrice = { starter: 29, professional: 99, growth_plus: 149, agency: 249 }[planKey] || 99;
    const updated = { ...open, plan: planKey, amountCents: Math.round(planPrice * 100), commissionCents: Math.round(planPrice * 100 * (pct / 100)), status: "pending", updatedAt: new Date().toISOString() };
    try { await this.referrals.upsert(open.id, updated); } catch {}
    memReferrals.set(open.id, updated);
    return updated;
  }
  async createInvoice(user, input = {}) {
    const offer = clientOfferCatalog.find((o) => o.key === input.offerKey);
    const amount = Number(input.amountUsd || offer?.priceUsd || 0);
    if (!amount || amount <= 0) { const e = new Error("Set a valid invoice amount."); e.status = 422; e.code = "INVALID_AMOUNT"; throw e; }
    const invoice = {
      id: randomUUID(),
      ownerUid: user.uid,
      ownerEmail: user.email || "",
      leadId: input.leadId || "",
      leadName: input.leadName || "",
      offerKey: offer?.key || "custom",
      offerName: offer?.name || "Custom client work",
      amountCents: Math.round(amount * 100),
      clientName: input.clientName || "",
      clientEmail: input.clientEmail || "",
      notes: String(input.notes || "").slice(0, 1000),
      dueDate: String(input.dueDate || "").slice(0, 10),
      paymentUrl: normalizedPaymentUrl(input.paymentUrl),
      paymentInstructions: String(input.paymentInstructions || "").slice(0, 1200),
      status: "open",
      createdAt: new Date().toISOString()
    };
    invoice.payLink = `/pay.html?invoice=${encodeURIComponent(invoice.id)}`;
    try { await this.invoices.upsert(invoice.id, invoice); } catch {}
    memInvoices.set(invoice.id, invoice);
    return { invoice };
  }
  async myInvoices(user) {
    try {
      return await this.invoices.list({ limit: 100, where: [{ field: "ownerUid", op: "==", value: user.uid }] });
    } catch {
      return [...memInvoices.values()].filter((i) => i.ownerUid === user.uid);
    }
  }
  async getInvoice(id) {
    try {
      const found = await this.invoices.findById(id);
      if (found) return found;
    } catch {}
    return memInvoices.get(id) || null;
  }
  publicInvoice(invoice) {
    if (!invoice) return null;
    return {
      id: invoice.id,
      offerName: invoice.offerName,
      amountCents: invoice.amountCents,
      leadName: invoice.leadName || "",
      clientName: invoice.clientName || "",
      status: invoice.status || "open",
      dueDate: invoice.dueDate || "",
      paymentUrl: normalizedPaymentUrl(invoice.paymentUrl),
      paymentInstructions: invoice.paymentInstructions || "",
      payLink: invoice.payLink || `/pay.html?invoice=${encodeURIComponent(invoice.id)}`,
      createdAt: invoice.createdAt || ""
    };
  }
  async markInvoicePaid(id, user, input = {}) {
    const inv = await this.getInvoice(id);
    if (!inv) { const e = new Error("Invoice not found."); e.status = 404; e.code = "INVOICE_NOT_FOUND"; throw e; }
    if (!user?.uid || (!isAdminUser(user) && String(inv.ownerUid || "") !== String(user.uid))) {
      throw new AppError("Only the invoice owner can confirm a payment.", 403, "INVOICE_OWNER_REQUIRED");
    }
    const updated = { ...inv, status: "paid", transactionId: input.transactionId || "", paidAt: new Date().toISOString() };
    try { await this.invoices.upsert(id, updated); } catch {}
    memInvoices.set(id, updated);
    return { invoice: updated };
  }
  async requestPayout(user, input = {}) {
    const amountCents = Math.round(Number(input.amountUsd || 0) * 100);
    if (!amountCents || amountCents < 1000) { const e = new Error("Minimum payout is $10."); e.status = 422; e.code = "PAYOUT_MINIMUM"; throw e; }
    const payout = { id: randomUUID(), ownerUid: user.uid, ownerEmail: user.email || "", amountCents, destination: String(input.destination || "").slice(0, 200), status: "requested", createdAt: new Date().toISOString() };
    try { await this.payouts.create(payout); } catch {}
    memPayouts.push(payout);
    return { payout };
  }
  async myPayouts(user) {
    try {
      return await this.payouts.list({ limit: 100, where: [{ field: "ownerUid", op: "==", value: user.uid }] });
    } catch {
      return memPayouts.filter((p) => p.ownerUid === user.uid);
    }
  }
}

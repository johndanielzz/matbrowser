import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";
const tools = [
  { id: "firstgig", label: "First Gig", title: "Your First Freelance Gig", hint: "Pick a real service you can sell this week with no experience.",
    fields: [{ id: "skill", label: "Any skill / interest", placeholder: "e.g. I use WhatsApp a lot" }, { id: "time", label: "Hours you have / week", placeholder: "e.g. 5 hours" }, { id: "tool", label: "Tools you can use", placeholder: "e.g. phone + Canva", wide: true }],
    build: (v) => `You are an earn-online coach for students. Suggest a realistic first freelance gig.\nMy skill/interest: ${v.skill}\nTime available: ${v.time}\nTools: ${v.tool}\n\nGive: 3 gig ideas I can start now, who to sell them to, a starter price in USD, and the exact first step today. ${P}` },
  { id: "beginnerprice", label: "Beginner Pricing", title: "What To Charge As A Beginner", hint: "Confident prices even with zero experience.",
    fields: [{ id: "service", label: "Service", placeholder: "e.g. design a flyer" }, { id: "market", label: "Who buys", placeholder: "e.g. local shops" }, { id: "worry", label: "Your worry", placeholder: "e.g. I have no portfolio", wide: true }],
    build: (v) => `You are a pricing coach for beginners. Tell me what to charge.\nService: ${v.service}\nBuyers: ${v.market}\nMy worry: ${v.worry}\n\nGive: a fair starter price range, the exact number to say, how to handle the worry, and one way to build proof fast. ${P}` },
  { id: "followup", label: "WhatsApp Follow-up", title: "WhatsApp Follow-up Sequence", hint: "Polite follow-ups that get replies without being pushy.",
    fields: [{ id: "context", label: "Context", placeholder: "e.g. sent a quote, no reply" }, { id: "offer", label: "What you offered", placeholder: "e.g. $299 website" }, { id: "tone", label: "Tone", placeholder: "e.g. friendly, short", wide: true }],
    build: (v) => `You are a WhatsApp sales expert. Write a 3-message follow-up sequence.\nContext: ${v.context}\nOffer: ${v.offer}\nTone: ${v.tone}\n\nEach message under 40 words, human, not spammy. End with an easy yes/no question. ${P}` },
  { id: "audit", label: "Paid Audit", title: "Local Business Audit (Sellable)", hint: "A mini audit you can deliver and charge $50-$150 for.",
    fields: [{ id: "business", label: "Business", placeholder: "e.g. a salon with no site" }, { id: "channel", label: "Where they are online", placeholder: "e.g. Instagram only" }, { id: "issue", label: "Biggest gap", placeholder: "e.g. no online booking", wide: true }],
    build: (v) => `You are a digital marketing auditor. Write a short, valuable business audit a client will pay for.\nBusiness: ${v.business}\nOnline presence: ${v.channel}\nBiggest gap: ${v.issue}\n\nGive: 3 quick wins, 1 growth opportunity, an estimated impact, and a recommended next step (your paid service). ${P}` },
  { id: "payment", label: "Payment Follow-up", title: "Get Paid / Invoice Reminder", hint: "Friendly messages that get overdue invoices paid.",
    fields: [{ id: "amount", label: "Amount owed", placeholder: "e.g. $300" }, { id: "days", label: "Days overdue", placeholder: "e.g. 5 days" }, { id: "rel", label: "Relationship", placeholder: "e.g. repeat client", wide: true }],
    build: (v) => `You are a polite but firm accounts assistant. Write a payment reminder.\nAmount: ${v.amount}\nDays overdue: ${v.days}\nRelationship: ${v.rel}\n\nGive: a friendly first reminder and a firmer final notice, each under 40 words, keeping the relationship intact. ${P}` },
  { id: "brand", label: "Name + Slogan", title: "Business Name & Slogan", hint: "Name + tagline ideas for a new side business or brand.",
    fields: [{ id: "idea", label: "Business idea", placeholder: "e.g. thrift fashion resale" }, { id: "vibe", label: "Vibe", placeholder: "e.g. bold, youthful" }, { id: "who", label: "Who it's for", placeholder: "e.g. students", wide: true }],
    build: (v) => `You are a brand naming expert. Generate brand names + slogans.\nIdea: ${v.idea}\nVibe: ${v.vibe}\nAudience: ${v.who}\n\nGive: 6 catchy business names and a matching one-line slogan for each. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

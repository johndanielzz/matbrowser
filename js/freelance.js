import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";
const tools = [
  { id: "gig", label: "Gig Builder", title: "Freelance Gig Builder", hint: "A sellable Fiverr/Upwork gig: title, description, packages, tags.",
    fields: [{ id: "service", label: "Service / niche", placeholder: "e.g. build a 1-page website" }, { id: "skill", label: "Your skill", placeholder: "e.g. beginner, 2 months learning" }, { id: "buyer", label: "Target buyer", placeholder: "e.g. small restaurants" }],
    build: (v) => `You are a freelance coach. Build a ready-to-post freelance gig.\nService/niche: ${v.service}\nSkill/experience: ${v.skill}\nTarget buyer: ${v.buyer}\n\nGive: 1 punchy gig title, a 150-word gig description, 3 packages (Basic/Standard/Premium) with USD prices and delivery days, and 5 search tags. ${P}` },
  { id: "resume", label: "Resume", title: "Resume Builder", hint: "A clean, modern resume tailored to the job you want.",
    fields: [{ id: "role", label: "Target role", placeholder: "e.g. junior web designer" }, { id: "exp", label: "Experience / skills", placeholder: "e.g. 1 yr freelance, HTML/CSS", wide: true }, { id: "edu", label: "Education", placeholder: "e.g. BSc Computer Science" }],
    build: (v) => `You are a resume writer. Write a strong, ATS-friendly resume.\nTarget role: ${v.role}\nExperience/skills: ${v.exp}\nEducation: ${v.edu}\n\nGive: a 2-line professional summary, 4 achievement bullet points (with numbers), a skills line, and an education line. ${P}` },
  { id: "cover", label: "Cover Letter", title: "Cover Letter Writer", hint: "A short cover letter that gets replies.",
    fields: [{ id: "role", label: "Role applying for", placeholder: "e.g. virtual assistant" }, { id: "company", label: "Company / client", placeholder: "e.g. a busy coach" }, { id: "why", label: "Why you're a fit", placeholder: "e.g. fast, organized, great WhatsApp replies", wide: true }],
    build: (v) => `You are a career coach. Write a concise cover letter (under 150 words).\nRole: ${v.role}\nCompany/client: ${v.company}\nWhy I fit: ${v.why}\n\nMake it warm, confident, end with a clear call to action. ${P}` },
  { id: "bio", label: "Portfolio Bio", title: "Portfolio / Profile Bio", hint: "A pro bio for your website, LinkedIn or Fiverr profile.",
    fields: [{ id: "who", label: "Who you are", placeholder: "e.g. freelance designer from Lagos" }, { id: "do", label: "What you do", placeholder: "e.g. I build websites for small businesses" }, { id: "proof", label: "Proof / results", placeholder: "e.g. 20+ happy clients", wide: true }],
    build: (v) => `You are a personal-branding writer. Write a 60-word professional bio.\nWho: ${v.who}\nWhat I do: ${v.do}\nProof: ${v.proof}\n\nConfident, first-person, one strong hook. ${P}` },
  { id: "proposal", label: "Proposal", title: "Freelance Proposal", hint: "A winning proposal that lands the contract.",
    fields: [{ id: "client", label: "Client need", placeholder: "e.g. needs a booking website" }, { id: "solve", label: "How you'll solve it", placeholder: "e.g. 3-page site + WhatsApp button", wide: true }, { id: "price", label: "Your price", placeholder: "e.g. $600 in 7 days" }],
    build: (v) => `You are a proposal expert. Write a short winning freelance proposal.\nClient need: ${v.client}\nMy solution: ${v.solve}\nPrice/timeline: ${v.price}\n\nStructure: 1-line hook, understanding of their problem, my plan (3 bullets), price + timeline, one next step. ${P}` },
  { id: "contract", label: "Contract / SOW", title: "Contract & Scope of Work", hint: "A simple freelance contract so you get paid and stay protected.",
    fields: [{ id: "project", label: "Project", placeholder: "e.g. 1-page business website" }, { id: "deliver", label: "Deliverables", placeholder: "e.g. design + build + 1 revision", wide: true }, { id: "terms", label: "Price & timeline", placeholder: "e.g. $600, 50% upfront, 7 days" }],
    build: (v) => `You are a contracts assistant. Write a simple, fair freelance agreement.\nProject: ${v.project}\nDeliverables: ${v.deliver}\nPrice & timeline: ${v.terms}\n\nInclude: scope, deliverables, payment terms, revisions limit, ownership after full payment, and a signature line. Plain, professional language. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";
const tools = [
  { id: "landing", label: "Landing Page", title: "Landing Page Copy", hint: "A full landing page that turns clicks into leads.",
    fields: [{ id: "offer", label: "Offer", placeholder: "e.g. free website audit" }, { id: "audience", label: "Audience", placeholder: "e.g. dentists" }, { id: "action", label: "Main action", placeholder: "e.g. book a call", wide: true }],
    build: (v) => `You are a conversion copywriter. Write landing page copy.\nOffer: ${v.offer}\nAudience: ${v.audience}\nMain action: ${v.action}\n\nGive: hero headline, subhead, 3 benefit sections, a trust/proof line, FAQ (3), and the final CTA. ${P}` },
  { id: "ads", label: "Ad Copy", title: "Paid Ad Variants", hint: "Facebook / Google ad copy that converts.",
    fields: [{ id: "business", label: "Business / offer", placeholder: "e.g. meal prep delivery" }, { id: "audience", label: "Audience", placeholder: "e.g. busy professionals" }, { id: "goal", label: "Goal", placeholder: "e.g. 20% off first order", wide: true }],
    build: (v) => `You are a direct-response copywriter. Write 3 paid ad variants.\nBusiness: ${v.business}\nAudience: ${v.audience}\nGoal: ${v.goal}\n\nEach: headline, primary text (under 60 words), CTA button, one targeting tip. Mark the best WINNER. ${P}` },
  { id: "seo", label: "SEO Meta", title: "SEO Title, Meta & Keywords", hint: "On-page SEO so clients rank and find you.",
    fields: [{ id: "page", label: "Page / business", placeholder: "e.g. plumber in Accra" }, { id: "service", label: "Main service", placeholder: "e.g. emergency plumbing" }, { id: "location", label: "Location", placeholder: "e.g. Accra, Ghana", wide: true }],
    build: (v) => `You are an SEO specialist. Give on-page SEO for a local business page.\nPage/business: ${v.page}\nService: ${v.service}\nLocation: ${v.location}\n\nGive: 1 SEO title (under 60 chars), 1 meta description (under 155 chars), 8 target keywords, and 3 H2 heading ideas. ${P}` },
  { id: "chatbot", label: "Chatbot Script", title: "Website Chatbot Script", hint: "A chatbot flow you can add to client sites and charge for.",
    fields: [{ id: "business", label: "Business", placeholder: "e.g. a dental clinic" }, { id: "goal", label: "Bot goal", placeholder: "e.g. book appointments" }, { id: "faq", label: "Top questions", placeholder: "e.g. price, hours, location", wide: true }],
    build: (v) => `You are a conversational designer. Write a website chatbot script.\nBusiness: ${v.business}\nGoal: ${v.goal}\nTop questions: ${v.faq}\n\nGive: a greeting, 5 bot replies with quick-reply buttons, a lead-capture step, and a handoff message. ${P}` },
  { id: "objections", label: "Objection Scripts", title: "Objection Handling Scripts", hint: "Win 'too expensive', 'not now', 'I'll think about it'.",
    fields: [{ id: "offer", label: "What you sell", placeholder: "e.g. $799 website" }, { id: "objections", label: "Objections you hear", placeholder: "e.g. too pricey, send info", wide: true }],
    build: (v) => `You are a sales coach. Write confident replies to objections.\nWhat I sell: ${v.offer}\nObjections: ${v.objections}\n\nFor each objection give: a short empathetic reply + a reframe + a question that moves forward. ${P}` },
  { id: "casestudy", label: "Case Study", title: "Case Study Writer", hint: "Proof that closes premium clients.",
    fields: [{ id: "client", label: "Client type", placeholder: "e.g. a restaurant" }, { id: "problem", label: "Problem", placeholder: "e.g. no online orders", wide: true }, { id: "result", label: "Result", placeholder: "e.g. +40% orders in 30 days" }],
    build: (v) => `You are a case-study writer. Write a short results story.\nClient: ${v.client}\nProblem: ${v.problem}\nResult: ${v.result}\n\nStructure: the challenge, what I did (3 steps), the result with numbers, and a one-line client quote. ${P}` },
  { id: "retainer", label: "Retainer Upsell", title: "Retainer Upsell Pitch", hint: "Turn one-off projects into monthly recurring income.",
    fields: [{ id: "service", label: "Service delivered", placeholder: "e.g. built their website" }, { id: "client", label: "Client", placeholder: "e.g. a gym owner" }, { id: "monthly", label: "Monthly offer", placeholder: "e.g. updates + hosting, $99/mo", wide: true }],
    build: (v) => `You are a recurring-revenue strategist. Write a retainer upsell message.\nService I delivered: ${v.service}\nClient: ${v.client}\nMonthly offer: ${v.monthly}\n\nGive: a short WhatsApp-style pitch, the value they keep getting, the price, and a low-friction yes question. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

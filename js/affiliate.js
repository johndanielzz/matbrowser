import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";

// Offline earnings estimator — instant, no AI.
function epcRun(v, out) {
  const visitors = parseFloat(v.visitors) || 0;
  const ctr = (parseFloat(v.ctr) || 0) / 100;
  const conv = (parseFloat(v.conv) || 0) / 100;
  const price = parseFloat(v.price) || 0;
  const comm = (parseFloat(v.comm) || 0) / 100;
  const clicks = visitors * ctr;
  const sales = clicks * conv;
  const income = sales * price * comm;
  out.textContent =
    `Affiliate Earnings Estimator\n` +
    `Monthly visitors: ${visitors}\n` +
    `Click rate: ${(ctr * 100).toFixed(1)}%  ->  ${clicks.toFixed(0)} clicks\n` +
    `Conversion: ${(conv * 100).toFixed(1)}%  ->  ${sales.toFixed(1)} sales\n` +
    `Product price: $${price.toFixed(2)}  x  ${(comm * 100).toFixed(0)}% commission\n\n` +
    `Estimated monthly income: $${income.toFixed(2)}\n\n` +
    (income > 0 ? "Tip: more targeted visitors or a higher-commission offer moves this number most." : "Fill visitors, click rate, conversion, price and commission to see income.");
}

const tools = [
  { id: "niche", label: "Pick Niche", title: "Choose A Profitable Niche", hint: "A niche with buyers, not just browsers.",
    fields: [{ id: "interest", label: "Your interest / topic", placeholder: "e.g. home fitness" }, { id: "audience", label: "Who you can reach", placeholder: "e.g. busy moms" }, { id: "goal", label: "Income goal", placeholder: "e.g. $1000/mo", wide: true }],
    build: (v) => `You are an affiliate marketing strategist. Help pick a profitable niche.\nInterest: ${v.interest}\nAudience: ${v.audience}\nGoal: ${v.goal}\n\nGive: 3 profitable sub-niches, the products to promote in each, the affiliate networks to join, and how to reach first income fastest. ${P}` },
  { id: "review", label: "Review Article", title: "Write A Review That Sells", hint: "An honest review that earns clicks and commissions.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. a course on Canva" }, { id: "who", label: "Who it's for", placeholder: "e.g. small business owners" }, { id: "pros", label: "Main pros / cons", placeholder: "e.g. pro: easy, con: price", wide: true }],
    build: (v) => `You are an honest affiliate reviewer. Write a review that converts.\nProduct: ${v.product}\nAudience: ${v.who}\nPros/cons: ${v.pros}\n\nGive: a hook intro, who it is for and not for, 3 key points, and a soft recommendation with a call to action. Keep it trustworthy. ${P}` },
  { id: "bonus", label: "Bonus Stack", title: "Build A Bonus Stack", hint: "Free extras that make people buy through your link.",
    fields: [{ id: "product", label: "Main product", placeholder: "e.g. hosting plan" }, { id: "audience", label: "Buyer type", placeholder: "e.g. new bloggers" }, { id: "skill", label: "Bonus you can make", placeholder: "e.g. a setup checklist", wide: true }],
    build: (v) => `You are an affiliate offer expert. Build a bonus stack to boost conversions.\nMain product: ${v.product}\nBuyers: ${v.audience}\nBonus idea: ${v.skill}\n\nGive: 4 bonuses that fix buyer objections, how to deliver each, and the exact pitch line that adds them to your link. ${P}` },
  { id: "email", label: "Email Funnel", title: "Affiliate Email Funnel", hint: "A short email sequence that warms then sells.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. email tool" }, { id: "audience", label: "Audience", placeholder: "e.g. solopreneurs" }, { id: "pain", label: "Their pain", placeholder: "e.g. messy inbox", wide: true }],
    build: (v) => `You are an email marketing strategist. Write a 4-email affiliate funnel.\nProduct: ${v.product}\nAudience: ${v.audience}\nPain: ${v.pain}\n\nGive: a welcome email, 2 value emails, and 1 sales email. Each under 120 words, human, ending in one clear action. ${P}` },
  { id: "epc", label: "Earnings Estimator", title: "Affiliate Earnings Estimator", hint: "Type traffic numbers to see monthly income.",
    run: epcRun,
    fields: [{ id: "visitors", label: "Monthly visitors", value: "1000", type: "number" }, { id: "ctr", label: "Click rate (%)", value: "5", type: "number" }, { id: "conv", label: "Conversion (%)", value: "2", type: "number" }, { id: "price", label: "Product price ($)", value: "100", type: "number" }, { id: "comm", label: "Commission (%)", value: "40", type: "number" }] },
  { id: "traffic", label: "Free Traffic", title: "Get Free Traffic", hint: "Bring visitors without paying for ads.",
    fields: [{ id: "niche", label: "Your niche", placeholder: "e.g. personal finance" }, { id: "platform", label: "Platform you like", placeholder: "e.g. TikTok" }, { id: "time", label: "Time per week", placeholder: "e.g. 5 hours", wide: true }],
    build: (v) => `You are an organic traffic expert. Give a free traffic plan for an affiliate.\nNiche: ${v.niche}\nPlatform: ${v.platform}\nTime: ${v.time}\n\nGive: 5 content ideas that pull buyers, a posting rhythm, and how to lead each post to your affiliate link. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

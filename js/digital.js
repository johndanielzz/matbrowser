import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";
const tools = [
  { id: "course", label: "Course Outline", title: "Online Course Outline", hint: "Turn your skill into a course you can sell.",
    fields: [{ id: "topic", label: "Course topic", placeholder: "e.g. WhatsApp marketing for shops" }, { id: "audience", label: "Who it's for", placeholder: "e.g. total beginners" }, { id: "outcome", label: "End result", placeholder: "e.g. students get 5 clients", wide: true }],
    build: (v) => `You are an online course creator. Design a sellable mini-course.\nTopic: ${v.topic}\nAudience: ${v.audience}\nEnd result: ${v.outcome}\n\nGive: a catchy course title, a 1-line promise, 5 modules with 2 lessons each, one bonus, and a suggested price in USD. ${P}` },
  { id: "ebook", label: "Ebook Plan", title: "Ebook / Guide Plan", hint: "A quick digital guide you can sell or use as a lead magnet.",
    fields: [{ id: "topic", label: "Topic", placeholder: "e.g. 10 ways to get local customers" }, { id: "reader", label: "Reader", placeholder: "e.g. small business owners" }],
    build: (v) => `You are a digital publisher. Plan a short, valuable ebook.\nTopic: ${v.topic}\nReader: ${v.reader}\n\nGive: a title, a subtitle, 6 chapter titles with one-line descriptions, and a price in USD. ${P}` },
  { id: "template", label: "Template Pack", title: "Template / Notion Pack", hint: "Package templates, checklists or spreadsheets to sell.",
    fields: [{ id: "niche", label: "Niche", placeholder: "e.g. social media for cafés" }, { id: "items", label: "What's inside", placeholder: "e.g. 20 captions + content calendar", wide: true }],
    build: (v) => `You are a digital product strategist. Design a template pack.\nNiche: ${v.niche}\nContents: ${v.items}\n\nGive: a product name, what's included (bullet list), who buys it, and a price in USD. ${P}` },
  { id: "proddesc", label: "Product Description", title: "E-commerce Product Description", hint: "Descriptions that make products sell.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. handmade leather wallet" }, { id: "features", label: "Key features", placeholder: "e.g. genuine leather, RFID", wide: true }, { id: "buyer", label: "Buyer", placeholder: "e.g. men 25-40" }],
    build: (v) => `You are an e-commerce copywriter. Write a product description.\nProduct: ${v.product}\nFeatures: ${v.features}\nBuyer: ${v.buyer}\n\nGive: a hook headline, a benefit-driven paragraph, 4 feature bullets, and a strong closing CTA line. ${P}` },
  { id: "pricing", label: "Pricing Tiers", title: "Digital Product Pricing", hint: "Price your digital product so it actually sells.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. a Canva template pack" }, { id: "market", label: "Market / buyers", placeholder: "e.g. Instagram beginners" }, { id: "cost", label: "Time / cost to make", placeholder: "e.g. 6 hours", wide: true }],
    build: (v) => `You are a pricing strategist for digital products.\nProduct: ${v.product}\nMarket: ${v.market}\nCost/time: ${v.cost}\n\nGive: 3 price points (entry/standard/premium) in USD with what each includes, the price to launch with, and one upsell idea. ${P}` },
  { id: "salespage", label: "Sales Page", title: "Sales Page Copy", hint: "A full sales page that converts visitors into buyers.",
    fields: [{ id: "product", label: "Product / offer", placeholder: "e.g. WhatsApp marketing course" }, { id: "problem", label: "Problem it solves", placeholder: "e.g. shops get no online orders", wide: true }, { id: "price", label: "Price", placeholder: "e.g. $49" }],
    build: (v) => `You are a conversion copywriter. Write sales page copy.\nProduct: ${v.product}\nProblem it solves: ${v.problem}\nPrice: ${v.price}\n\nGive: headline, subheadline, 3 benefit blocks, a proof/testimonial placeholder, a price + guarantee line, and a CTA. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

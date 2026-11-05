import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";

// Offline margin calculator — instant, no AI needed.
function marginRun(v, out) {
  const price = parseFloat(v.price) || 0;
  const cost = parseFloat(v.cost) || 0;
  const ad = parseFloat(v.ad) || 0;
  const fee = price * 0.029 + 0.3; // typical payment gateway
  const profit = price - cost - ad - fee;
  const margin = price ? (profit / price) * 100 : 0;
  out.textContent =
    `E-commerce Profit Calculator\n` +
    `Sell price: $${price.toFixed(2)}\n` +
    `Product cost: $${cost.toFixed(2)}\n` +
    `Ad cost per sale: $${ad.toFixed(2)}\n` +
    `Payment fee (~2.9% + $0.30): $${fee.toFixed(2)}\n\n` +
    `Profit per sale: $${profit.toFixed(2)}\n` +
    `Profit margin: ${margin.toFixed(1)}%\n\n` +
    (margin >= 30 ? "Healthy margin. You can scale ads on this." : margin >= 10 ? "Okay but thin. Push price up or cost down before scaling." : "Too thin. Raise price or drop the ad cost or this loses money.");
}

const tools = [
  { id: "product", label: "Winning Product", title: "Find A Winning Product", hint: "A product people already want to buy online.",
    fields: [{ id: "niche", label: "Niche / interest", placeholder: "e.g. pet owners" }, { id: "audience", label: "Who buys", placeholder: "e.g. dog parents 25-45" }, { id: "budget", label: "Budget to test", placeholder: "e.g. $200", wide: true }],
    build: (v) => `You are a dropshipping product researcher. Suggest winning products.\nNiche: ${v.niche}\nAudience: ${v.audience}\nTest budget: ${v.budget}\n\nGive: 5 product ideas with a wow factor, the problem each solves, a rough sell price, and why it will sell. End with how to test one on a small budget. ${P}` },
  { id: "listing", label: "Product Listing", title: "Product Listing That Converts", hint: "Title, bullets and description that turn views into orders.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. portable blender" }, { id: "who", label: "Who it's for", placeholder: "e.g. gym goers" }, { id: "benefits", label: "Top 3 benefits", placeholder: "e.g. USB recharge, 500ml, quiet", wide: true }],
    build: (v) => `You are a conversion copywriter for online stores. Write a product listing.\nProduct: ${v.product}\nAudience: ${v.who}\nBenefits: ${v.benefits}\n\nGive: a scroll-stopping title, 5 benefit bullets, a short description, and a clear call to action. ${P}` },
  { id: "supplier", label: "Supplier DM", title: "Message A Supplier", hint: "Reach out to a manufacturer or wholesaler and open a deal.",
    fields: [{ id: "supplier", label: "Supplier / platform", placeholder: "e.g. AliExpress seller" }, { id: "product", label: "Product you want", placeholder: "e.g. led strip lights" }, { id: "goal", label: "Your goal", placeholder: "e.g. best wholesale price", wide: true }],
    build: (v) => `You are an e-commerce sourcing expert. Write a supplier outreach message.\nSupplier: ${v.supplier}\nProduct: ${v.product}\nGoal: ${v.goal}\n\nGive: a short professional message asking for pricing, minimum order, and shipping. Keep it polite and business-like. ${P}` },
  { id: "ads", label: "Store Ads", title: "Ad Plan For Your Store", hint: "A simple paid-ads plan to get your first sales.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. posture corrector" }, { id: "audience", label: "Target audience", placeholder: "e.g. office workers 30-55" }, { id: "budget", label: "Daily ad budget", placeholder: "e.g. $20/day", wide: true }],
    build: (v) => `You are a paid-ads strategist for e-commerce. Build a simple ad plan.\nProduct: ${v.product}\nAudience: ${v.audience}\nDaily budget: ${v.budget}\n\nGive: 3 ad angles with hooks, the best platform, a testing plan, and the number that tells you to scale or stop. ${P}` },
  { id: "margin", label: "Profit Calculator", title: "Store Profit Calculator", hint: "Type your numbers to see real profit per sale.",
    run: marginRun,
    fields: [{ id: "price", label: "Sell price ($)", value: "49", type: "number" }, { id: "cost", label: "Product cost ($)", value: "12", type: "number" }, { id: "ad", label: "Ad cost per sale ($)", value: "10", type: "number" }] },
  { id: "reviews", label: "Trust & Reviews", title: "Get Reviews & Trust", hint: "Social proof so new buyers feel safe to order.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. skincare set" }, { id: "stage", label: "Store stage", placeholder: "e.g. brand new" }, { id: "doubt", label: "Buyer doubt", placeholder: "e.g. is it legit", wide: true }],
    build: (v) => `You are an e-commerce trust expert. Help a store build social proof.\nProduct: ${v.product}\nStage: ${v.stage}\nBuyer doubt: ${v.doubt}\n\nGive: how to get the first reviews, a review-request message, and trust signals to add to the product page. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

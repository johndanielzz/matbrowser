import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";

// Offline retainer price calculator.
function retainerRun(v, out) {
  const posts = parseFloat(v.posts) || 0;
  const perPost = parseFloat(v.perPost) || 0;
  const extra = parseFloat(v.extra) || 0;
  const total = posts * perPost + extra;
  out.textContent =
    `Social Media Retainer Calculator\n` +
    `Posts per month: ${posts}  x  $${perPost.toFixed(2)} each = $${(posts * perPost).toFixed(2)}\n` +
    `Extra services (ads, stories, reports): $${extra.toFixed(2)}\n\n` +
    `Suggested monthly retainer: $${total.toFixed(2)}\n\n` +
    (total >= 500 ? "Great retainer. Charge monthly, not per post, for steady income." : total > 0 ? "Add more value (strategy + ads + reports) to raise this." : "Fill posts, price per post and extras to see your retainer.");
}

const tools = [
  { id: "pitch", label: "Client Pitch", title: "Pitch A Business To Manage Their Socials", hint: "A DM or message that lands the client.",
    fields: [{ id: "business", label: "Business", placeholder: "e.g. a local gym" }, { id: "gap", label: "What they lack", placeholder: "e.g. posts once a month" }, { id: "offer", label: "What you'll do", placeholder: "e.g. 12 posts + reels", wide: true }],
    build: (v) => `You are a social media manager pitching a client. Write a short pitch.\nBusiness: ${v.business}\nTheir gap: ${v.gap}\nMy offer: ${v.offer}\n\nGive: a friendly opening, the value they get, one proof point, and a soft ask to chat. Under 80 words, human. ${P}` },
  { id: "plan", label: "Content Plan", title: "Monthly Content Plan", hint: "A simple plan that grows an account.",
    fields: [{ id: "brand", label: "Brand / niche", placeholder: "e.g. a bakery" }, { id: "platform", label: "Platform", placeholder: "e.g. Instagram" }, { id: "goal", label: "Goal", placeholder: "e.g. more orders", wide: true }],
    build: (v) => `You are a social media strategist. Build a 1-month content plan.\nBrand: ${v.brand}\nPlatform: ${v.platform}\nGoal: ${v.goal}\n\nGive: 4 content pillars, 8 post ideas, a posting rhythm, and how to turn followers into customers. ${P}` },
  { id: "captions", label: "Captions + Hooks", title: "Captions & Hooks That Engage", hint: "Scroll-stopping captions and first lines.",
    fields: [{ id: "topic", label: "Post topic", placeholder: "e.g. new menu item" }, { id: "vibe", label: "Brand vibe", placeholder: "e.g. fun, friendly" }, { id: "cta", label: "Action you want", placeholder: "e.g. order now", wide: true }],
    build: (v) => `You are a social media copywriter. Write captions and hooks.\nTopic: ${v.topic}\nVibe: ${v.vibe}\nAction: ${v.cta}\n\nGive: 3 strong hooks (first lines), a full caption for the best one, and a clear call to action. ${P}` },
  { id: "growth", label: "Growth Plan", title: "Grow An Account Fast", hint: "Real tactics to gain followers and reach.",
    fields: [{ id: "niche", label: "Niche", placeholder: "e.g. real estate" }, { id: "current", label: "Current size", placeholder: "e.g. 200 followers" }, { id: "target", label: "Target", placeholder: "e.g. 2000 in 60 days", wide: true }],
    build: (v) => `You are a social media growth expert. Give a realistic growth plan.\nNiche: ${v.niche}\nCurrent: ${v.current}\nTarget: ${v.target}\n\nGive: 5 growth tactics, a daily routine, content types that get reach, and what to track weekly. ${P}` },
  { id: "retainer", label: "Retainer Calculator", title: "Social Media Retainer Calculator", hint: "Price your monthly management fee.",
    run: retainerRun,
    fields: [{ id: "posts", label: "Posts per month", value: "12", type: "number" }, { id: "perPost", label: "Price per post ($)", value: "40", type: "number" }, { id: "extra", label: "Extra services ($)", value: "150", type: "number" }] },
  { id: "report", label: "Client Report", title: "Results Report (Keep Clients)", hint: "Show value so clients renew every month.",
    fields: [{ id: "month", label: "Month", placeholder: "e.g. March" }, { id: "wins", label: "Wins this month", placeholder: "e.g. +500 followers, 12 leads" }, { id: "next", label: "Plan for next month", placeholder: "e.g. add reels + ads", wide: true }],
    build: (v) => `You are a social media manager writing a client report. Keep them paying.\nMonth: ${v.month}\nWins: ${v.wins}\nNext plan: ${v.next}\n\nGive: a short wins summary, one number that matters, and the next-month plan that justifies renewing. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

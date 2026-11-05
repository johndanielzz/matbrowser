import { byId, formatCurrency, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";
const tools = [
  { id: "video", label: "Video Script", title: "Short Video Script", hint: "Reels / TikTok / YouTube scripts that sell or grow.",
    fields: [{ id: "topic", label: "Video topic", placeholder: "e.g. why your shop needs a website" }, { id: "platform", label: "Platform", placeholder: "e.g. Instagram Reels, 30s" }, { id: "cta", label: "Call to action", placeholder: "e.g. DM me 'SITE'", wide: true }],
    build: (v) => `You are a short-form video scriptwriter.\nTopic: ${v.topic}\nPlatform/length: ${v.platform}\nCTA: ${v.cta}\n\nGive: a 1-second hook line, the body (3 beats), and the closing CTA. Add an on-screen text note for each beat. ${P}` },
  { id: "calendar", label: "Content Calendar", title: "7-Day Content Calendar", hint: "A week of posts a business will pay you to run.",
    fields: [{ id: "business", label: "Business / niche", placeholder: "e.g. a barbershop" }, { id: "voice", label: "Brand voice", placeholder: "e.g. fun, bold, local" }, { id: "goal", label: "Goal", placeholder: "e.g. more bookings", wide: true }],
    build: (v) => `You are a social media manager. Create a 7-day content calendar.\nBusiness: ${v.business}\nVoice: ${v.voice}\nGoal: ${v.goal}\n\nFor each day: post idea, ready caption with emojis, and 5 hashtags. ${P}` },
  { id: "newsletter", label: "Newsletter", title: "Newsletter Issue", hint: "An email newsletter that builds audience and sells.",
    fields: [{ id: "topic", label: "Main topic", placeholder: "e.g. 3 mistakes costing shops customers" }, { id: "audience", label: "Audience", placeholder: "e.g. small business owners" }, { id: "offer", label: "Soft offer (optional)", placeholder: "e.g. my $99 audit", wide: true }],
    build: (v) => `You are a newsletter writer. Write one issue.\nTopic: ${v.topic}\nAudience: ${v.audience}\nSoft offer: ${v.offer || "none"}\n\nGive: subject line, a friendly intro, 3 short value sections, and a soft CTA. ${P}` },
  { id: "blog", label: "Blog Ideas", title: "Blog / Article Ideas", hint: "SEO article ideas that pull in buyers.",
    fields: [{ id: "niche", label: "Niche", placeholder: "e.g. websites for restaurants" }, { id: "reader", label: "Reader", placeholder: "e.g. restaurant owners" }],
    build: (v) => `You are an SEO content strategist. Give 8 blog/article ideas that attract buyers.\nNiche: ${v.niche}\nReader: ${v.reader}\n\nFor each: a title and one line on the angle + the keyword it targets. ${P}` },
  { id: "ugc", label: "UGC Brief", title: "UGC / Influencer Brief", hint: "A brief you can send creators — or fulfill as a UGC creator.",
    fields: [{ id: "product", label: "Product", placeholder: "e.g. a skincare serum" }, { id: "vibe", label: "Vibe / style", placeholder: "e.g. authentic, morning routine" }, { id: "deliver", label: "Deliverables", placeholder: "e.g. 2 Reels + 3 stories", wide: true }],
    build: (v) => `You are a UGC campaign manager. Write a creator brief.\nProduct: ${v.product}\nVibe: ${v.vibe}\nDeliverables: ${v.deliver}\n\nGive: goal, target viewer, do's and don'ts, required shots/hooks, and posting notes. ${P}` },
  { id: "testimonials", label: "Testimonials", title: "Testimonial / Review Writer", hint: "Turn happy moments into reviews that sell.",
    fields: [{ id: "business", label: "Business / product", placeholder: "e.g. my web design service" }, { id: "result", label: "Result the client got", placeholder: "e.g. 3x more orders", wide: true }, { id: "name", label: "Client name", placeholder: "e.g. Ada" }],
    build: (v) => `You are a copywriter. Write 3 short, believable customer testimonials.\nBusiness/product: ${v.business}\nResult: ${v.result}\nClient name: ${v.name || "a client"}\n\nEach under 30 words, specific and natural. ${P}` },
  { id: "rate", label: "Rate Calculator", title: "Freelance Rate Calculator", hint: "Offline tool: the hourly rate to hit your income goal.",
    run: (v, out) => {
      const income = Number(v.income) || 0, hours = Number(v.hours) || 0, weeks = Number(v.weeks) || 0, expenses = Number(v.expenses) || 0;
      const totalHours = hours * weeks;
      const rate = totalHours > 0 ? Math.ceil((income + expenses) / totalHours) : 0;
      const dayRate = Math.ceil(rate * (hours > 0 ? hours : 8));
      out.innerHTML = `<div class="metrics-grid">${[["Target / hour", formatCurrency(rate)], ["Suggested day rate", formatCurrency(dayRate)], ["Billable hours / month", totalHours]].map(([k, val]) => `<div class="card"><span>${k}</span><strong>${val}</strong></div>`).join("")}</div>`;
    },
    fields: [{ id: "income", label: "Monthly income goal (USD)", type: "number", value: "3000" }, { id: "hours", label: "Billable hours / week", type: "number", value: "20" }, { id: "weeks", label: "Weeks / month", type: "number", value: "4" }, { id: "expenses", label: "Monthly expenses (USD)", type: "number", value: "100" }]
  }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});

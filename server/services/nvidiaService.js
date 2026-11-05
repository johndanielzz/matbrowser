import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { isCreatorQuestion, creatorAnswer, identityLine } from "../utils/brand.js";
import { hasRealContent, visibleWordCount } from "../utils/siteContent.js";

const aiCache = new Map();
const modelCooldowns = new Map();
const MAX_CACHE_ENTRIES = 200;
const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
// A timeout is usually transient load, not a dead model. Cooling the only fast
// model for 5 minutes after one slow response cascades into every later call
// (they get pushed onto the ~44s fallbacks and time out too), so transient
// failures get a short cooldown instead.
const TRANSIENT_COOLDOWN_MS = 30 * 1000;

// Live-per-probe (Oct 2026): these exist; your key returns 403 until activated on
// https://build.nvidia.com/<model> ("Get API Key"). Dead IDs never get called.
const DEFAULT_MODELS = [
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "openai/gpt-oss-20b",
  "z-ai/glm-5.3-flash",
  "z-ai/glm-5.3",
  "nvidia/nemotron-3.5-lightning-30b-a3b"
];
const DEAD_MODELS = new Set([
  // 410 Gone — reached end of life 2026-10-15; confirmed via live probe.
  "moonshotai/kimi-k3",
  "deepseek-ai/deepseek-v4-flash",
  "deepseek-ai/deepseek-v4-flash-0731",
  "deepseek-ai/deepseek-v4-pro",
  "deepseek-ai/deepseek-v4.1-flash",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.1-8b",
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.2-1b-instruct",
  "meta/llama-3.2-3b-instruct",
  "meta/llama-3.3-70b-instruct",
  "meta/llama-4-maverick-17b-128e-instruct",
  "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-thinking",
  "qwen/qwen3-next-80b-a3b-instruct",
  "qwen/qwen3-next-80b-a3b-thinking",
  "qwen/qwen2.5-coder-32b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-nano-9b-v2",
  "openai/gpt-oss-120b",
  "stepfun-ai/step-3.5-flash",
  "microsoft/phi-4-mini-instruct",
  "minimaxai/minimax-m2.5",
  "minimaxai/minimax-m2.7",
  "upstage/solar-10.7b-instruct",
  "sarvamai/sarvam-m",
  "stockmark/stockmark-2-100b-instruct",
  "z-ai/glm-5.2",
  "z-ai/glm4.7",
  "llama-3.1-8b",
  "llama-4-maverick",
  "google/gemma-4-31b-it"
]);

function isRetiredModel(id = "") {
  const v = String(id || "").trim();
  if (!v) return true;
  return DEAD_MODELS.has(v);
}

const providerState = {
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastFailure: null
};

function isEndOfLifeError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("end of life") || msg.includes("end-of-life") || msg.includes("decommissioned") || msg.includes("retired") || msg.includes("no longer supported");
}

function plainTextAiOutput(content) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s*/g, "")
      .replace(/^\s*[*]+\s+/g, "")
      .replace(/^\s*[-]\s+/g, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[#$*]/g, "")
      .trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withPlainTextInstruction(messages) {
  const instruction = "Formatting rule: reply in plain text only. Do not use Markdown. Do not use # headings. Do not use * bullets or bold markers. Keep answers concise.";
  const normalized = Array.isArray(messages) ? [...messages] : [];
  if (normalized[0]?.role === "system") {
    normalized[0] = { ...normalized[0], content: `${instruction}\n\n${normalized[0].content}` };
    return normalized;
  }
  return [{ role: "system", content: instruction }, ...normalized];
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, item]) => {
    if (item === undefined || item === null || item === "") return false;
    if (Array.isArray(item) && item.length === 0) return false;
    if (typeof item === "object" && !Array.isArray(item) && Object.keys(item).length === 0) return false;
    return true;
  }));
}

function truncateText(value, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function missingAuditChecks(checks = {}) {
  return Object.entries(checks)
    .filter(([, passed]) => passed === false)
    .map(([key]) => key)
    .slice(0, 8);
}

function compactLeadForAi(lead = {}) {
  const details = lead.details || {};
  const audit = lead.audit || {};
  return compactObject({
    name: lead.name,
    category: lead.businessType || lead.category,
    address: truncateText(lead.address, 180),
    country: lead.country,
    market: lead.marketName || lead.market,
    phone: lead.phone,
    email: lead.email,
    website: lead.websiteUrl,
    maps: lead.googleMapsLink,
    rating: lead.rating,
    reviews: lead.reviewsCount,
    score: lead.opportunityScore || audit.score,
    missing: missingAuditChecks(audit.checks),
    owner: details.ownerContact?.ownerName || details.ownerContact?.operator || details.ownerContact?.contactPerson,
    openingHours: truncateText(lead.openingHours || details.operations?.openingHours, 180),
    social: Object.keys(details.social || {}).slice(0, 5),
    source: lead.source
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function cacheKeyFor(payload) {
  return crypto.createHash("sha256").update(stableJson(payload)).digest("hex");
}

function getCachedResult(cacheKey) {
  const cached = aiCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    aiCache.delete(cacheKey);
    return null;
  }
  return {
    ...cached.result,
    cached: true
  };
}

function setCachedResult(cacheKey, result, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  aiCache.set(cacheKey, {
    result,
    expiresAt: Date.now() + ttlMs
  });
  while (aiCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = aiCache.keys().next().value;
    aiCache.delete(oldestKey);
  }
}

function modelsToTry() {
  const now = Date.now();
  const configured = [env.nvidia.model, ...(env.nvidia.modelFallbacks || [])];
  const models = [...new Set([...configured, ...DEFAULT_MODELS].map((model) => String(model || "").trim()).filter(Boolean))]
    .filter((model) => !isRetiredModel(model))
    .filter((model) => (modelCooldowns.get(model) || 0) <= now);
  return models.slice(0, 2);
}

function modelRequestOptions(model) {
  // GLM 5.3 uses reasoning by default. These interactive business workflows
  // need a direct answer, so avoid spending the request budget on it.
  if (/^z-ai\/glm-5\.3/i.test(model)) {
    return {
      reasoning_effort: "low",
      chat_template_kwargs: { clear_thinking: true }
    };
  }
  // gpt-oss is a reasoning model; keep thinking minimal so it answers fast.
  if (/gpt-oss/i.test(model)) {
    return { reasoning_effort: "low" };
  }
  if (/nemotron-3\.5-lightning/i.test(model)) {
    return { chat_template_kwargs: { clear_thinking: true } };
  }
  return {};
}

// Kimi K3 pins top_p to 0.95 and rejects any override — respect that.
function modelTopP(model, requested) {
  if (/kimi-k3/i.test(model)) return 0.95;
  return Number(requested ?? 1);
}

function extractMessageContent(payload) {
  const choice = payload?.choices?.[0] || {};
  return choice.message?.content || choice.delta?.content || "";
}

function isReasoningExhausted(payload) {
  const choice = payload?.choices?.[0] || {};
  const message = choice.message || {};
  return !extractMessageContent(payload) && (Boolean(message.reasoning_content) || choice.finish_reason === "length");
}

function requestBudget(timeoutMs, maxTotalMs) {
  const requested = Number(timeoutMs);
  return Math.max(5000, Math.min(Number.isFinite(requested) ? requested : maxTotalMs, maxTotalMs));
}

function nextAttemptTimeout(deadlineAt, attemptsRemaining, maxAttemptMs) {
  const remaining = deadlineAt - Date.now();
  if (remaining < 3000) return 0;
  const reservedForFallbacks = Math.max(0, attemptsRemaining - 1) * 3000;
  return Math.max(3000, Math.min(maxAttemptMs, remaining - reservedForFallbacks));
}

function isRetryableNvidiaFailure(error) {
  const status = Number(error?.status || 0);
  if (isEndOfLifeError(error)) return true;
  return error?.code === "NVIDIA_TIMEOUT" || error?.name === "TypeError" || status === 400 || status === 404 || status === 408 || status === 409 || status === 429 || status >= 500;
}

function friendlyAiError(error, fallback = "AI is temporarily unavailable. Please try again in a moment.") {
  const raw = String(error?.message || "");
  if (/NVIDIA_API_KEY|NVIDIA_NOT_CONFIGURED/i.test(raw)) return "AI key missing. Add NVIDIA_API_KEY in Vercel env vars, then redeploy.";
  if (isEndOfLifeError(error)) return "That model retired — switched to a live model. Please try again.";
  if (/timed out|NVIDIA_TIMEOUT|504/i.test(raw)) return "AI took too long — I retried a faster model. Please send again.";
  if (/402|PRO_REQUIRED/i.test(raw)) return raw;
  if (/401|INVALID_TOKEN|Login required/i.test(raw)) return "Please log in again, then retry.";
  if (error?.status && Number(error.status) >= 500) return `${fallback} (${raw.slice(0, 160)})`;
  return raw || fallback;
}

function publicNvidiaError(error) {
  const raw = String(error?.message || "");
  const status = Number(error?.status || 0);
  if (error?.code === "NVIDIA_NOT_CONFIGURED") return error;
  if (status === 401) {
    return new AppError("NVIDIA rejected the API key (401). Open https://build.nvidia.com, sign in, click 'Get API Key', replace NVIDIA_API_KEY in .env/Vercel, then redeploy.", 503, "NVIDIA_AUTH_FAILED");
  }
  if (status === 403 || /authorization failed/i.test(raw)) {
    return new AppError("Your NVIDIA key is valid but not activated for this model (403). Fix: while signed in at https://build.nvidia.com, open the model page (e.g. https://build.nvidia.com/z-ai/glm-5.3-flash), click 'Get API Key' / activate it, then replace NVIDIA_API_KEY in .env and Vercel and redeploy.", 503, "NVIDIA_MODEL_NOT_ACTIVE");
  }
  if (status === 410 || /end of life/i.test(raw)) {
    return new AppError("This NVIDIA model retired (410). The app auto-rotates to a live model — retry now; if it repeats, activate z-ai/glm-5.3-flash at https://build.nvidia.com and update NVIDIA_API_KEY.", 503, "NVIDIA_MODEL_EOL");
  }
  if (status === 402 || /payment required|insufficient.*credit|billing/i.test(raw)) {
    return new AppError("NVIDIA AI has no available inference credit or model access. Check the NVIDIA account, then try again.", 503, "NVIDIA_CREDIT_REQUIRED");
  }
  if (isEndOfLifeError(error) || status === 404) {
    return new AppError("No configured NVIDIA model is available. Set NVIDIA_MODEL=z-ai/glm-5.3-flash, activate it at https://build.nvidia.com, then restart or redeploy.", 503, "NVIDIA_MODEL_UNAVAILABLE");
  }
  if (error?.code === "NVIDIA_TIMEOUT" || status === 408 || status === 504) {
    return new AppError("NVIDIA AI timed out. Please try again in a moment.", 503, "NVIDIA_TIMEOUT");
  }
  if (status === 400 || status === 422) {
    return new AppError("NVIDIA AI rejected this request. Check the configured model IDs and try again.", 503, "NVIDIA_REQUEST_REJECTED");
  }
  return new AppError("NVIDIA AI is temporarily unavailable. Please try again in a moment.", 503, "NVIDIA_UNAVAILABLE");
}

function markProviderSuccess() {
  const at = new Date().toISOString();
  providerState.lastCheckedAt = at;
  providerState.lastSuccessAt = at;
  providerState.lastFailure = null;
}

function markProviderFailure(error) {
  providerState.lastCheckedAt = new Date().toISOString();
  providerState.lastFailure = {
    code: error.code || "NVIDIA_UNAVAILABLE",
    message: error.message || "NVIDIA AI is unavailable."
  };
}

function coolDownModel(model, ms = MODEL_COOLDOWN_MS) {
  modelCooldowns.set(model, Date.now() + ms);
}

export class NvidiaService {
  configured() {
    return Boolean(env.nvidia.apiKey);
  }

  status() {
    return {
      configured: this.configured(),
      verification: providerState.lastSuccessAt ? "verified" : providerState.lastFailure ? "failed" : "unverified",
      lastCheckedAt: providerState.lastCheckedAt,
      lastSuccessAt: providerState.lastSuccessAt,
      lastFailure: providerState.lastFailure
    };
  }

  sanitizeMessages(messages = []) {
    // NVIDIA chat models accept text only. Drop image_url parts (your deepseek sample) so Tycoon/Studio never 400.
    return (Array.isArray(messages) ? messages : []).map((m) => {
      const role = m?.role || "user";
      const content = m?.content;
      if (typeof content === "string") return { role, content };
      if (Array.isArray(content)) {
        const text = content.filter((p) => p?.type === "text").map((p) => String(p?.text || "")).join("\n").trim();
        return { role, content: text || "(no text provided)" };
      }
      return { role, content: String(content ?? "") };
    }).filter((m) => String(m.content || "").trim().length);
  }

  async complete(messages, {
    temperature = 0.5,
    maxTokens = env.nvidia.maxTokens,
    topP = 1,
    frequencyPenalty = 0,
    presencePenalty = 0,
    stream = false,
    timeoutMs = env.nvidia.timeoutMs,
    cacheTtlMs = env.nvidia.cacheTtlMs,
    preferredModels = null,
    maxAttempts = 2
  } = {}) {
    if (!this.configured()) {
      throw new AppError("Real NVIDIA AI requires NVIDIA_API_KEY in .env.", 503, "NVIDIA_NOT_CONFIGURED");
    }

    const invokeUrl = `${env.nvidia.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const cleanMessages = this.sanitizeMessages(messages);
    const basePayload = {
      messages: withPlainTextInstruction(cleanMessages),
      max_tokens: Math.max(64, Math.min(Number(maxTokens) || env.nvidia.maxTokens, 4096)),
      temperature: Number(temperature ?? 0.5),
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stream
    };
    let lastError = null;

    const preferred = Array.isArray(preferredModels) ? preferredModels.filter((m) => m && !isRetiredModel(m)) : null;
    const queue = [...new Set([...(preferred && preferred.length ? preferred : []), ...modelsToTry()])]
      .filter((m) => !isRetiredModel(m))
      .slice(0, Math.max(1, Math.min(Number(maxAttempts) || 2, 2)));
    if (!queue.length) throw new AppError("No usable NVIDIA model is configured. Set NVIDIA_MODEL=z-ai/glm-5.3-flash and activate it at https://build.nvidia.com, then restart or redeploy.", 503, "NVIDIA_NO_LIVE_MODEL");
    const deadlineAt = Date.now() + requestBudget(timeoutMs, 60000);
    for (let index = 0; index < queue.length; index += 1) {
      const model = queue[index];
      // Give the primary model enough time under NVIDIA load while retaining a
      // hard total deadline for serverless requests.
      const attemptTimeoutMs = nextAttemptTimeout(deadlineAt, queue.length - index, 30000);
      if (!attemptTimeoutMs) break;
      const requestPayload = { ...basePayload, ...modelRequestOptions(model), model, top_p: modelTopP(model, topP) };
      const cacheKey = !stream && cacheTtlMs > 0 ? cacheKeyFor(requestPayload) : "";
      const cached = cacheKey ? getCachedResult(cacheKey) : null;
      if (cached) return cached;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
      let response;
      try {
        response = await fetch(invokeUrl, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Accept": stream ? "text/event-stream" : "application/json",
            "Authorization": `Bearer ${env.nvidia.apiKey}`
          },
          body: JSON.stringify(requestPayload)
        });
      } catch (error) {
        lastError = error?.name === "AbortError"
          ? new AppError(`NVIDIA model ${model} took too long to reply.`, 504, "NVIDIA_TIMEOUT")
          : error;
        clearTimeout(timeout);
        if (isRetryableNvidiaFailure(lastError)) {
          // A transient timeout cools the model briefly; a dead/retired ID gets
          // the full 5-minute ban so we don't lock out the only fast model.
          coolDownModel(model, lastError?.code === "NVIDIA_TIMEOUT" ? TRANSIENT_COOLDOWN_MS : MODEL_COOLDOWN_MS);
          // Timeouts are usually jitter on the fast primary (5-10s normally,
          // occasional 17s+ spikes). The slow fallbacks run ~44-100s live and can
          // never answer inside an interactive budget, so a timed-out first
          // attempt swaps the next slot to a retry of the SAME fast model — two
          // real chances instead of one real chance plus a doomed slow attempt.
          if (lastError?.code === "NVIDIA_TIMEOUT" && index === 0 && queue.length > 1 && queue[1] !== model) {
            queue[1] = model;
          }
          continue;
        }
        throw lastError;
      }
      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text();
        let detail = body.slice(0, 500);
        try {
          const parsed = JSON.parse(body);
          detail = parsed.error?.message || parsed.detail || detail;
        } catch {
          // Keep the raw text detail when NVIDIA returns non-JSON errors.
        }
        lastError = new AppError(`NVIDIA API request failed on ${model}: ${detail}`, response.status, "NVIDIA_API_ERROR");
        // EOL / retired models: ban for 5 min and move on instantly — don't burn the timeout.
        if (isEndOfLifeError(lastError) || isRetiredModel(model)) {
          coolDownModel(model);
          continue;
        }
        if (isRetryableNvidiaFailure(lastError)) {
          // 429/5xx are transient — short cool so a rate-limit blip doesn't
          // sideline the fast primary for 5 minutes and starve later calls.
          coolDownModel(model, TRANSIENT_COOLDOWN_MS);
          continue;
        }
        throw lastError;
      }

      let payload = await response.json();
      let content = extractMessageContent(payload);
      // GLM reasoning models can burn max_tokens thinking before answering.
      if (isReasoningExhausted(payload) && Date.now() < deadlineAt - 2500) {
        const retryController = new AbortController();
        const retryTimeout = setTimeout(() => retryController.abort(), Math.min(14000, Math.max(3000, deadlineAt - Date.now() - 500)));
        try {
          const retryResponse = await fetch(invokeUrl, {
            method: "POST",
            signal: retryController.signal,
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "Authorization": `Bearer ${env.nvidia.apiKey}`
            },
            body: JSON.stringify({ ...requestPayload, top_p: modelTopP(model, topP), max_tokens: Math.min(Math.max(maxTokens * 2, 900), 2600) })
          });
          if (retryResponse.ok) {
            const retryPayload = await retryResponse.json();
            const retryContent = extractMessageContent(retryPayload);
            if (retryContent) { payload = retryPayload; content = retryContent; }
          }
        } catch {
          // Keep the original payload; empty content path handles the failure.
        } finally {
          clearTimeout(retryTimeout);
        }
      }
      // Some models return HTTP 200 with empty content (observed live on glm and
      // nemotron). Retry instead of handing the user a "No content" placeholder.
      if (!String(content || "").trim()) {
        lastError = new AppError(`NVIDIA model ${model} returned an empty response.`, 502, "NVIDIA_EMPTY");
        coolDownModel(model, TRANSIENT_COOLDOWN_MS);
        if (index === 0 && queue.length > 1 && queue[1] !== model) queue[1] = model;
        continue;
      }
      const result = {
        configured: true,
        provider: "nvidia",
        model,
        content: plainTextAiOutput(content) || "No content returned by NVIDIA model.",
        usage: payload.usage || null,
        cached: false
      };
      if (cacheKey) setCachedResult(cacheKey, result, cacheTtlMs);
      markProviderSuccess();
      return result;
    }

    throw lastError || new AppError("NVIDIA AI could not complete the request.", 503, "NVIDIA_UNAVAILABLE");
  }

  async completeSafe(messages, options = {}) {
    try {
      return await this.complete(messages, options);
    } catch (error) {
      const publicError = publicNvidiaError(error);
      markProviderFailure(publicError);
      throw publicError;
    }
  }

  completeWithModel(messages, options = {}) {
    return this.complete(messages, options);
  }

  chat(prompt) {
    // Creator-identity questions are answered locally: guaranteed correct,
    // zero token cost, works even when the upstream key has no model access.
    if (isCreatorQuestion(prompt)) {
      const a = creatorAnswer();
      return Promise.resolve({ configured: true, provider: "brand-identity", model: "brand-identity", content: a.content, usage: null, cached: false, intent: a.intent });
    }
    return this.completeSafe([
      {
        role: "system",
        content: "You are MAT LEADS AI PRO X, a practical agency growth assistant. Give concise, useful, revenue-focused answers in plain text. " + identityLine()
      },
      {
        role: "user",
        content: truncateText(prompt, 3000)
      }
    ], { temperature: 0.4, maxTokens: env.nvidia.maxTokens }, "AI is temporarily unavailable. Please check NVIDIA_API_KEY and try again.");
  }

  analyzeLead(lead) {
    const leadContext = compactLeadForAi(lead);
    const fallback = `Opportunity: Website/SEO lead for ${lead?.name || "this business"}. Problems: Missing online presence data. Offer: Website audit + rebuild. First Outreach Angle: Free audit. Revenue Estimate: $799-$1499 setup.`;
    return this.completeSafe([
      {
        role: "system",
        content: "You are an expert agency growth strategist. Be factual, direct, and concise. Use plain text."
      },
      {
        role: "user",
        content: `Analyze this lead for website, SEO, AI automation, and marketing opportunity. Return these labels only: Opportunity, Problems, Offer, First Outreach Angle, Revenue Estimate. Keep under 160 words. Do not use # or * characters.\n\n${JSON.stringify(leadContext)}`
      }
    ], { temperature: 0.25, maxTokens: 320 }, fallback);
  }

  writeOutreach(lead, type) {
    const leadContext = compactLeadForAi(lead);
    const closers = {
      cold_email: "Cold email that books a call. Subject + 3 short paragraphs + paid-audit CTA.",
      follow_up: "Polite breakup follow-up with urgency + invoice CTA.",
      website_redesign: "Website redesign pitch with 3 flaws, outcome, price anchor $799-$1499.",
      seo: "Local SEO pitch with map-pack outcome + monthly retainer anchor.",
      marketing: "Marketing growth pitch with offer + guarantee + call CTA.",
      ai_automation: "AI chatbot/automation pitch with hours saved + setup + monthly.",
      business_audit: "Paid audit pitch: sell the $149 audit before the build."
    };
    const fallback = `Subject: Quick idea for ${lead?.name || "your business"}\n\nHi, I found your listing and can help with website, WhatsApp and bookings. Reply YES for a free audit.`;
    return this.completeSafe([
      {
        role: "system",
        content: "You write professional B2B outreach for web development, SEO, marketing, and AI automation agencies. Be specific, respectful, and concise. Use plain text. Always end with a clear money CTA."
      },
      {
        role: "user",
        content: `Write a ${closers[type] || type} for this business lead. Include a subject line, short email body, and one clear CTA. Keep under 150 words. Do not use # or * characters.\n\n${JSON.stringify(leadContext)}`
      }
    ], { temperature: 0.3, maxTokens: 300 }, fallback);
  }

  proposalPack(lead, offerKey = "pro_site") {
    const leadContext = compactLeadForAi(lead);
    const fallback = `Proposal for ${lead?.name || "your business"}: Website rebuild, WhatsApp + booking setup, $799-$1499, 7-14 days. Reply YES to approve.`;
    return this.completeSafe([
      { role: "system", content: "You are a proposal writer for agencies. Plain text only. Structure: Problem, Offer, Deliverables, Timeline, Price, Guarantee, Next step to pay." },
      { role: "user", content: `Write a client-ready proposal for offer ${offerKey} for this lead. Keep under 260 words. No markdown.\n\n${JSON.stringify(leadContext)}` }
    ], { temperature: 0.4, maxTokens: 500 }, fallback);
  }

  tycoonChat(prompt, context = {}) {
    const ctx = JSON.stringify(context).slice(0, 2000);
    const fallback = `What to say: Hi, I can rebuild your online presence with WhatsApp bookings. Price to quote: $799 setup + $99/mo care. Why it wins: direct bookings. Next move: send audit + pay link.`;
    if (isCreatorQuestion(prompt)) {
      const a = creatorAnswer();
      return Promise.resolve({ configured: true, provider: "brand-identity", model: "brand-identity", content: a.content, usage: null, cached: false, intent: a.intent });
    }
    const messages = [
      {
        role: "system",
        content: "You are BUSINESS AI TYCOON, a ruthless professional business tycoon mentor. You think like a billionaire closer: pricing psychology, negotiation, objection handling, WhatsApp scripts, follow-up cadence, upsells, retainers. Always give: 1) What to say (copy-paste script), 2) Price to quote, 3) Why it wins, 4) Next move. Keep it practical, confident, street-smart. Plain text only, no markdown symbols. " + identityLine()
      },
      {
        role: "user",
        content: `${String(prompt || "").slice(0, 1200)}\n\nLead context: ${ctx}`
      }
    ];
    return this.completeSafe(messages, { temperature: 0.35, topP: 1, maxTokens: 360, timeoutMs: env.nvidia.timeoutMs, cacheTtlMs: 600000, preferredModels: [env.nvidia.tycoonModel, "nvidia/nemotron-3.5-lightning-30b-a3b", "openai/gpt-oss-20b"], maxAttempts: 2 }).catch(async (error) => {
      // A shorter retry handles occasional reasoning-budget exhaustion on the
      // long mentor system prompt without returning a fake answer.
      return this.completeSafe([
        { role: "system", content: "You are a concise business mentor. Plain text only. Give what to say, price, why it wins, and next move." },
        { role: "user", content: `${String(prompt || "").slice(0, 900)}\nLead context: ${ctx.slice(0, 800)}` }
      ], { temperature: 0.25, maxTokens: 260, timeoutMs: env.nvidia.timeoutMs, cacheTtlMs: 0, preferredModels: ["nvidia/nemotron-3.5-lightning-30b-a3b"], maxAttempts: 1 }).catch(() => { throw error; });
    });
  }

  agentChat(prompt, accountContext = {}) {
    const context = JSON.stringify(accountContext).slice(0, 3200);
    const messages = [
      {
        role: "system",
        content: "You are the friendly human-like MAT LEADS AI Agent. You help users understand and use every part of MAT LEADS AI PRO X: lead search, filters, saved leads, CRM, website audits, Website Studio, outreach, analytics, billing, settings, and chat. Respond naturally and empathetically, like a patient expert teammate. For greetings, greet the user and offer useful ways you can help. When a user describes a problem, acknowledge it, explain the likely cause in simple language, give clear numbered steps using the actual page or button names, and ask one helpful follow-up question if needed. Use the supplied account snapshot for personalized recommendations. Never claim that you performed a search, sent a message, changed CRM data, completed an audit, or changed billing. Never invent contacts, metrics, or business facts. If something requires a user click, say so. Plain text only; no markdown symbols."
      },
      {
        role: "user",
        content: `User message: ${String(prompt || "").slice(0, 1800)}\nVerified account snapshot: ${context}`
      }
    ];
    return this.completeSafe(messages, { temperature: 0.45, maxTokens: 460, timeoutMs: env.nvidia.timeoutMs, cacheTtlMs: 120000, preferredModels: ["nvidia/nemotron-3.5-lightning-30b-a3b", "openai/gpt-oss-20b"], maxAttempts: 2 }).catch(async (error) => {
      return this.completeSafe([
        { role: "system", content: "You are a warm, patient MAT LEADS support agent. Answer the user's question naturally, explain the next steps clearly, and never claim an action was completed. Plain text only." },
        { role: "user", content: `User message: ${String(prompt || "").slice(0, 1000)}` }
      ], { temperature: 0.35, maxTokens: 300, timeoutMs: env.nvidia.timeoutMs, cacheTtlMs: 0, preferredModels: ["nvidia/nemotron-3.5-lightning-30b-a3b"], maxAttempts: 1 }).catch(() => { throw error; });
    });
  }

  async completeRaw(messages, { temperature = 0.5, topP = 1, maxTokens = 2200, timeoutMs = 0 } = {}) {
    if (!this.configured()) {
      throw new AppError("Real NVIDIA AI requires NVIDIA_API_KEY in .env.", 503, "NVIDIA_NOT_CONFIGURED");
    }
    const invokeUrl = `${env.nvidia.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const models = modelsToTry();
    const websiteModels = [...new Set([env.nvidia.websiteModel, ...(env.nvidia.websiteFallbacks || []), ...models].map((model) => String(model || "").trim()).filter(Boolean))]
      .filter((model) => !isRetiredModel(model))
      .slice(0, 2);
    const deadlineAt = Date.now() + requestBudget(timeoutMs || env.nvidia.websiteTimeoutMs, 55000);
    const cleanMessages = this.sanitizeMessages(messages);
    let lastError = null;
    for (let index = 0; index < websiteModels.length; index += 1) {
      const model = websiteModels[index];
      // Website builds emit ALL pages in one response, so the primary model needs
      // almost the entire budget (~43s observed, with variance). The old 46s cap
      // was too tight and a single slow build timed out and killed the site.
      const attemptTimeoutMs = nextAttemptTimeout(deadlineAt, websiteModels.length - index, 51000);
      if (!attemptTimeoutMs) break;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
      try {
        const response = await fetch(invokeUrl, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${env.nvidia.apiKey}` },
          body: JSON.stringify({ model, ...modelRequestOptions(model), messages: cleanMessages, max_tokens: maxTokens, temperature: Number(temperature ?? 0.5), top_p: modelTopP(model, topP), stream: false })
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const body = await response.text();
          lastError = new AppError(`NVIDIA API request failed on ${model}: ${body.slice(0, 400)}`, response.status, "NVIDIA_API_ERROR");
          if (isEndOfLifeError(lastError) || isRetiredModel(model)) {
            coolDownModel(model);
            continue;
          }
          if (isRetryableNvidiaFailure(lastError)) continue;
          throw lastError;
        }
        let payload = await response.json();
        let content = extractMessageContent(payload);
        // GLM reasoning models can burn max_tokens thinking before answering.
        if (isReasoningExhausted(payload) && Date.now() < deadlineAt - 2500) {
          const retryController = new AbortController();
          const retryTimeout = setTimeout(() => retryController.abort(), Math.min(14000, Math.max(3000, deadlineAt - Date.now() - 500)));
          try {
            const retryResponse = await fetch(invokeUrl, {
              method: "POST",
              signal: retryController.signal,
              headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${env.nvidia.apiKey}` },
              body: JSON.stringify({ model, ...modelRequestOptions(model), messages: cleanMessages, max_tokens: Math.min(Math.max(maxTokens * 2, 1400), 3000), temperature: Number(temperature ?? 0.5), top_p: modelTopP(model, topP), stream: false })
            });
            if (retryResponse.ok) {
              const retryPayload = await retryResponse.json();
              const retryContent = extractMessageContent(retryPayload);
              if (retryContent) { payload = retryPayload; content = retryContent; }
            }
          } catch {
            // Keep the original payload; empty content path handles the failure.
          } finally {
            clearTimeout(retryTimeout);
          }
        }
        if (!content) { lastError = new AppError("Empty NVIDIA response", 503, "NVIDIA_EMPTY"); continue; }
        markProviderSuccess();
        return { configured: true, provider: "nvidia", model, content, usage: payload.usage || null, cached: false };
      } catch (error) {
        clearTimeout(timeout);
        lastError = error?.name === "AbortError" ? new AppError(`NVIDIA model ${model} timed out.`, 504, "NVIDIA_TIMEOUT") : error;
        if (isRetryableNvidiaFailure(lastError)) {
          coolDownModel(model, lastError?.code === "NVIDIA_TIMEOUT" ? TRANSIENT_COOLDOWN_MS : MODEL_COOLDOWN_MS);
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new AppError("NVIDIA AI could not complete the request.", 503, "NVIDIA_UNAVAILABLE");
  }

  cleanHtml(raw) {
    let html = String(raw || "");
    html = html.replace(/```html/gi, "").replace(/```/g, "").trim();
    const start = html.toLowerCase().indexOf("<!doctype");
    if (start > 0) html = html.slice(start);
    if (!/<html/i.test(html)) html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
    return html.slice(0, 120000);
  }

  cleanFragment(raw) {
    return String(raw || "")
      .replace(/```html/gi, "").replace(/```/g, "")
      .replace(/<!doctype[^>]*>/i, "")
      .replace(/<html[^>]*>/i, "").replace(/<\/html>/i, "")
      .replace(/<head[^>]*>[\s\S]*?<\/head>/i, "")
      .replace(/<body[^>]*>/i, "").replace(/<\/body>/i, "")
      .trim();
  }

  assembleMultiPage(pages, business, accent) {
    const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const navLinks = pages.map((p, i) => `<a href="#pg-${i}" class="nav-a${i === 0 ? " active" : ""}">${e(p.title)}</a>`).join("");
    const sections = pages.map((p, i) => `<section class="pg" id="pg-${i}"${i === 0 ? "" : ' style="display:none"'}>${p.body}</section>`).join("\n");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(business)}</title><meta name="description" content="Learn about ${e(business)} and get in touch."><style>*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',Inter,system-ui,Arial,sans-serif;color:#16233a;background:linear-gradient(180deg,#f4f6fb 0%,#eef2f7 100%);line-height:1.6}img{max-width:100%;height:auto;border-radius:14px}.nav{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);display:flex;gap:6px;align-items:center;padding:12px 20px;flex-wrap:wrap;box-shadow:0 2px 14px rgba(15,23,42,.1);backdrop-filter:blur(10px)}.nav .brand{font-weight:800;margin-right:auto;font-size:1.08rem;letter-spacing:-.01em}.nav-a{color:#334155;text-decoration:none;font-weight:600;padding:9px 15px;border-radius:999px;font-size:.9rem;transition:all .2s}.nav-a.active,.nav-a:hover{background:#0f172a;color:#fff}.pg{max-width:1140px;margin:0 auto;padding:28px 22px 48px}.site-foot{background:#0f172a;color:#cbd5e1;text-align:center;padding:26px;font-size:.88rem}form.site-form{display:grid;gap:10px;max-width:520px}input,textarea,select{padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;width:100%}button{cursor:pointer}</style></head><body><nav class="nav"><span class="brand">${e(business)}</span>${navLinks}</nav>${sections}<footer class="site-foot">© ${new Date().getFullYear()} ${e(business)}. All rights reserved.</footer></body></html>`;
  }

  fallbackPageFragment(spec, lead, hero, gallery, isHome) {
    const name = String(lead?.name || "Your Business");
    const type = String(lead?.businessType || lead?.category || "Local Business");
    const address = String(lead?.address || "");
    const phone = String(lead?.phone || "");
    const email = String(lead?.email || "");
    const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const card = (h, p) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px"><h3 style="margin:.1em 0 .3em">${e(h)}</h3><p style="margin:0;color:#475569">${e(p)}</p></div>`;
    const gal = gallery.slice(0, 3).map((u) => `<img src="${e(u)}" alt="${e(name)}" style="width:100%;height:180px;object-fit:cover;border-radius:12px">`).join("");
    if (isHome) return `<img src="${e(hero)}" alt="${e(name)} — professional ${e(type)}" style="width:100%;max-height:440px;object-fit:cover;display:block"><div class="wrap" style="text-align:center"><p style="letter-spacing:3px;text-transform:uppercase;font-size:12px;color:#64748b;margin:18px 0 0;font-weight:700">${e(type)}</p><h1 style="font-size:clamp(2rem,5.4vw,3.4rem);margin:.2em 0;color:#0f172a">${e(name)}</h1><p style="max-width:660px;margin:0 auto;color:#475569;font-size:1.08rem;line-height:1.6">Professional, reliable ${e(type.toLowerCase())} you can count on. Clear pricing, fast response, and work we stand behind — so getting started is easy.${address ? ` Find us at ${e(address)}.` : ""}</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px">${phone ? `<a href="tel:${e(phone)}" style="padding:14px 28px;border-radius:12px;background:#16a34a;color:#fff;font-weight:700;text-decoration:none;box-shadow:0 8px 20px rgba(22,163,74,.28)">Call ${e(phone)}</a>` : ""}<a href="#contact" style="padding:14px 28px;border-radius:12px;background:#0f172a;color:#fff;font-weight:700;text-decoration:none">Get a free quote</a></div><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px">${["Licensed & insured", "Fast, friendly service", "Free, no-obligation quotes", "Proudly local"].map((c) => `<span style="background:#eef2f7;border:1px solid #e2e8f0;color:#334155;padding:8px 15px;border-radius:999px;font-size:.84rem;font-weight:600">${e(c)}</span>`).join("")}</div></div><div class="wrap"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-top:6px">${card("Quality you can trust", "Careful work and honest advice on every single job.")}${card("Clear, upfront pricing", "Know the cost before we begin — no hidden fees.")}${card("Here when you need us", "Quick response and friendly support after the job.")}</div>${gal ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:22px">${gal}</div>` : ""}</div>`;
    if (spec.id === "about") return `<div class="wrap"><h2>About ${e(name)}</h2><p>We are a dedicated ${e(type.toLowerCase())} committed to quality and honest service. Our experienced team treats every customer like a neighbour.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:16px">${card("Trusted", "Loved by local customers.")}${card("Experienced", "Years of hands-on expertise.")}${card("Fair pricing", "Transparent, no surprises.")}</div></div>`;
    if (spec.id === "services") return `<div class="wrap"><h2>Our Services</h2><p>Everything you need, done right the first time.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:16px">${card("Service One", "Professional work delivered on time.")}${card("Service Two", "Solutions tailored to your needs.")}${card("Service Three", "Great value, every single time.")}${card("Service Four", "Friendly support before and after.")}</div></div>`;
    if (spec.id === "contact") return `<div class="wrap"><h2>Contact Us</h2><p>${phone ? `Call <a href="tel:${e(phone)}"><strong>${e(phone)}</strong></a>. ` : ""}${email ? `Email <a href="mailto:${e(email)}">${e(email)}</a>. ` : ""}${address ? e(address) : ""}</p><form style="display:grid;gap:10px;max-width:520px;margin-top:12px"><input placeholder="Your name" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px"><input type="email" placeholder="Your email" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px"><textarea rows="4" placeholder="How can we help?" style="padding:12px;border:1px solid #cbd5e1;border-radius:10px"></textarea><button type="submit" style="padding:13px 24px;border:0;border-radius:10px;background:#22c55e;color:#06281a;font-weight:700">Send message</button></form></div>`;
    return `<div class="wrap"><h2>${e(spec.title)}</h2><p>${e(name)} — ${e(type)}.</p></div>`;
  }

  // Deliberately overrides the legacy fallback above. It keeps a useful
  // professional structure without presenting unverified credentials, review
  // scores, response times, prices, or guarantees as business facts.
  fallbackPageFragment(spec, lead, hero, gallery, isHome) {
    const name = String(lead?.name || "Your Business");
    const type = String(lead?.businessType || lead?.category || "Local Business");
    const address = String(lead?.address || "");
    const phone = String(lead?.phone || "");
    const email = String(lead?.email || "");
    const e = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const card = (title, copy) => `<article style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px"><h3 style="margin:.1em 0 .3em">${e(title)}</h3><p style="margin:0;color:#475569">${e(copy)}</p></article>`;
    const galleryMarkup = gallery.slice(0, 3).map((url) => `<img src="${e(url)}" alt="${e(name)}" style="width:100%;height:180px;object-fit:cover;border-radius:12px">`).join("");
    if (isHome) {
      return `<img src="${e(hero)}" alt="${e(name)}" style="width:100%;max-height:440px;object-fit:cover;display:block"><div class="wrap" style="text-align:center"><p style="letter-spacing:3px;text-transform:uppercase;font-size:12px;color:#64748b;margin:18px 0 0;font-weight:700">${e(type)}</p><h1 style="font-size:clamp(2rem,5.4vw,3.4rem);margin:.2em 0;color:#0f172a">${e(name)}</h1><p style="max-width:660px;margin:0 auto;color:#475569;font-size:1.08rem;line-height:1.6">Explore verified business information and choose a contact method that works for you.</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px">${phone ? `<a href="tel:${e(phone)}" style="padding:14px 28px;border-radius:12px;background:#16a34a;color:#fff;font-weight:700;text-decoration:none">Call us</a>` : ""}<a href="#contact" style="padding:14px 28px;border-radius:12px;background:#0f172a;color:#fff;font-weight:700;text-decoration:none">Get in touch</a></div></div><div class="wrap"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-top:6px">${card("Services and details", "Add clear, verified information about what this business offers.")}${card("Simple next steps", "Help visitors call, email, or request information with confidence.")}${card("Keep information current", "Update service areas, availability, and customer proof when verified.")}</div>${galleryMarkup ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-top:22px">${galleryMarkup}</div>` : ""}</div>`;
    }
    if (spec.id === "about") return `<div class="wrap"><h2>About ${e(name)}</h2><p>Add the verified story, people, and details that help visitors understand this ${e(type.toLowerCase())} business.</p></div>`;
    if (spec.id === "services") return `<div class="wrap"><h2>Services</h2><p>List the current services and useful details customers should know before contacting the business.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:16px">${card("Service details", "Describe a verified service.")}${card("Who it helps", "Explain the relevant customer need.")}${card("How to enquire", "Give a clear, confirmed next step.")}</div></div>`;
    if (spec.id === "contact") return `<div class="wrap" id="contact"><h2>Contact</h2>${phone ? `<p>Phone: <a href="tel:${e(phone)}">${e(phone)}</a></p>` : ""}${email ? `<p>Email: <a href="mailto:${e(email)}">${e(email)}</a></p>` : ""}${address ? `<p>${e(address)}</p>` : ""}<form style="display:grid;gap:10px;max-width:520px;margin-top:12px"><input placeholder="Your name"><input type="email" placeholder="Your email"><textarea rows="4" placeholder="How can we help?"></textarea><button type="submit">Send enquiry</button></form></div>`;
    return `<div class="wrap"><h2>${e(spec.title)}</h2><p>${e(name)} — ${e(type)}.</p></div>`;
  }

  async buildWebsite(lead = {}, options = {}) {
    const imgs = options.images || {};
    const heroImg = String(imgs.hero || "").trim();
    const galleryImgs = Array.isArray(imgs.gallery) ? imgs.gallery.map((g) => String(g || "").trim()).filter(Boolean).slice(0, 6) : [];
    const seedWord = String(lead.businessType || lead.category || options.businessName || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "business";
    const autoHero = `https://picsum.photos/seed/${encodeURIComponent(seedWord)}/1600/900`;
    const autoGallery = [1, 2, 3].map((n) => `https://picsum.photos/seed/${encodeURIComponent(seedWord + "-" + n)}/800/600`);
    const hero = heroImg || autoHero;
    const gallery = galleryImgs.length ? galleryImgs : autoGallery;
    const accentMap = { emerald: "#22c55e", blue: "#2563eb", gold: "#d4af37", rose: "#e11d48", teal: "#14b8a6", purple: "#7c3aed", orange: "#f97316" };
    const accent = accentMap[options.palette] || "#22c55e";
    const pageCount = Math.min(4, Math.max(1, parseInt(options.pages, 10) || 1));
    const allSpecs = [
      { id: "home", title: "Home", focus: "a full-width hero image + headline + call button, a short intro, a 3-item highlights row, and the gallery images in one responsive row" },
      { id: "about", title: "About", focus: "our story, why choose us, trust points and a values/team section" },
      { id: "services", title: "Services", focus: "a detailed services grid (4-6 services with short descriptions) plus a packages/pricing row" },
      { id: "contact", title: "Contact", focus: "a contact form (name, email, message), a click-to-call button, address and hours" },
    ];
    const pageSpecs = allSpecs.slice(0, pageCount);
    const business = String(lead.name || options.businessName || "Your Business");
    const brief = JSON.stringify({
      business, type: lead.businessType || lead.category, address: lead.address,
      phone: lead.phone, email: lead.email, style: options.style || "modern",
      colors: options.palette || "emerald", targetAudience: options.targetAudience || "",
      primaryGoal: options.primaryGoal || "enquiries", location: options.location || "",
      services: options.services || "", cta: options.cta || "", about: options.about || "",
      language: options.language || "", images: { hero, gallery }
    }).slice(0, 1500);
    // ONE request generates ALL pages as fragments separated by <!--PAGE--> so we
    // stay inside the model's token/time budget. The shell + navigation are
    // assembled in code, so the site always renders and the pages always switch.
    const request = (maxTokens, note) => this.completeRaw([
      { role: "system", content: `You are MAT LEADS Studio, an award-winning web design studio whose output rivals Claude's best sites. Output ONLY the inner content for a ${pageCount}-page business website. PRO STANDARD: generous whitespace, oversized display headlines, eyebrow kickers with letter-spacing, gradient or image hero bands with overlay, elevated cards (radius 16-20px, soft shadows, hover lift), trust chips, stats with big numerals, numbered process steps, testimonial band on Home ONLY labelled sample with no invented names, FAQ accordion with <details>/<summary>, sticky mobile call bar, closing CTA band with gradient. RULES: (1) Separate each page with the exact marker <!--PAGE--> on its own line, and emit exactly ${pageCount} page(s) in this order: ${pageSpecs.map((p) => p.title).join(", ")}. (2) Do NOT output <!doctype>, <html>, <head>, <body> or <nav> — only the page content. (3) You MUST open with ONE single-line <style> block defining your OWN fresh classes for hero/cards/buttons/stats/faq/cta (never reuse generic .hero-band/.card); keep it under ~60 declarations. (4) Use the exact image URLs from the brief in real <img> tags with loading=lazy and descriptive alt text; never leave src empty; never emit placeholder grey boxes. (5) Every page opens with a HERO: eyebrow kicker, one bold benefit-led headline, one supporting sentence, TWO buttons; then vary the middle (stats row, process steps, image+text split, pricing teasers, sample testimonial band, FAQ accordion) with a DIFFERENT order and emphasis each build. (6) Copy: warm, confident, benefit-led, short sentences; NEVER invent awards, reviews, licenses, addresses or numbers — use neutral placeholders or omit. (7) FULL LENGTH: every page complete, each at least ~1200 characters of body content; NEVER truncate. (8) No markdown, no explanations, no code fences.` },
      { role: "user", content: `Build the ${pageCount} page section(s) for: ${brief}. Page focuses: ${pageSpecs.map((p) => `${p.title} = ${p.focus}`).join("; ")}. Hero uses images.hero; put images.gallery URLs in an <img> row on the Home page. Separate every page with <!--PAGE-->. ${note || ""}` }
    ], { temperature: 0.85, maxTokens, timeoutMs: Math.max(60000, env.nvidia.websiteTimeoutMs || 90000) });
    let result = await request(4000);
    let content = String(result.content || "");
    // Retry when the build is thin by EITHER measure: short total length, or —
    // the failure mode that shipped empty sites — lots of CSS but almost no
    // visible words. A style-only response is a failed build, so re-ask once.
    if (content.replace(/<!--PAGE-->/gi, "").trim().length < 2600 || visibleWordCount(content) < 180) {
      try {
        const retry = await request(5200, "Previous attempt was cut short — write FULLY complete pages this time with every section finished. Separate each page with <!--PAGE--> and end cleanly.");
        if (String(retry.content || "").length > content.length) { result = retry; content = String(retry.content || ""); }
      } catch { /* keep first attempt */ }
    }
    const fragments = content.split(/<!--PAGE-->/i).map((s) => this.cleanFragment(s)).filter(Boolean);
    const pages = pageSpecs.map((spec, i) => ({
      ...spec,
      // Require real visible content (heading + prose), not just a CSS block, so
      // a style-only fragment can never ship as an empty page.
      body: hasRealContent(fragments[i]) ? fragments[i] : this.fallbackPageFragment(spec, lead, hero, gallery, i === 0),
    }));
    const html = this.assembleMultiPage(pages, business, accent);
    return { ...result, html, pageCount: pages.length };
  }

  refineWebsite(currentHtml, instruction, meta = {}) {
    return this.completeRaw([
      { role: "system", content: "You are an elite website editor AI. Return ONLY the complete updated HTML file with inline CSS/JS. Keep the response concise and under 1100 tokens. Apply the requested change and preserve the core business details. No markdown or explanations." },
      { role: "user", content: `Current site for ${meta.businessName || meta.leadName || "business"}:\n${String(currentHtml || "").slice(0, 6000)}\n\nRequested change: ${String(instruction || "").slice(0, 800)}\n\nReturn only the full updated HTML.` }
    ], { temperature: 0.3, maxTokens: 1100, timeoutMs: 18000 })
      .then((r) => ({ ...r, html: this.cleanHtml(r.content) }))
      .catch((error) => {
        const publicError = publicNvidiaError(error);
        markProviderFailure(publicError);
        throw publicError;
      });
  }
}

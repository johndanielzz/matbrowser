import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { isCreatorQuestion, creatorAnswer, identityLine } from "../utils/brand.js";
import { hasRealContent, visibleWordCount, repairTruncatedHtml, missingPageSections } from "../utils/siteContent.js";

const POLLINATIONS = {
  GEN_BASE: "https://gen.pollinations.ai",
  MODELS: {
    // Cheap, fast, non-reasoning flagship default for interactive workloads.
    // Overridable via POLLINATIONS_TEXT_MODEL so owners can pin a model their key allows.
    TEXT_DEFAULT: "openai/gpt-5.4-nano",
    TEXT_FALLBACKS: ["openai/gpt-5-nano", "openai/gpt-oss-20b", "google/gemini-3-flash-preview", "openai/gpt-4o-mini", "mistralai/mistral-small-3.2", "meta/llama-3.3-70b-instruct"],
    // Website builds want large, reliable instruction followers.
    // Overridable via POLLINATIONS_WEBSITE_MODEL.
    WEBSITE_DEFAULT: "openai/gpt-5.4",
    WEBSITE_FALLBACKS: ["qwen/qwen3-coder-30b-a3b-instruct", "openai/gpt-5.4-mini", "openai/gpt-5.5", "moonshotai/kimi-k2.6", "openai/gpt-5-nano", "google/gemini-3-flash-preview", "openai/gpt-4o-mini", "mistralai/mistral-small-3.2"],
    // Output budget for a COMPLETE professional multi-page site (fragments, not full docs).
    WEBSITE_TOKENS_FIRST: 4000,
    WEBSITE_TOKENS_RETRY: 5200,
    WEBSITE_TIMEOUT_MS: 120000,
    // Minimum body chars per page before we call the build incomplete.
    WEBSITE_MIN_PAGE_CHARS: 1200,
    // Minimum total fragment chars before we retry the build.
    WEBSITE_MIN_TOTAL_CHARS: 2600,
    // Minimum *visible* words before we retry — a CSS-only response can be long
    // yet contain no readable text, which previously shipped empty sites.
    WEBSITE_MIN_VISIBLE_WORDS: 180,
    // Rotating professional design archetypes — one is picked per build so no two
    // sites share the same look unless the user repeats the same choices.
    DESIGN_ARCHETYPES: [
      { id: "luxe-dark", label: "Luxe dark", vibe: "bg #0c0a09 text #fafaf9 surface #1c1917 accent gold #d4a437; Fraunces serif headlines + Inter body", hero: "full-bleed image, dark gradient overlay, centered serif headline, gold eyebrow", sections: "stats row first, then image+text split, then process steps" },
      { id: "editorial", label: "Editorial paper", vibe: "bg #faf7f2 text #1c1917 surface #ffffff accent rust #c2410c; Newsreader serif headlines, thin rules", hero: "left-aligned oversized headline, small kicker, inline image right", sections: "image+text split first, then services grid, then testimonial band" },
      { id: "bold-agency", label: "Bold agency", vibe: "bg #ffffff text #0f172a surface #f1f5f9 accent electric indigo #4f46e5 + lime #bef264; Space Grotesk chunky headlines", hero: "split-screen: headline + badges left, image collage right on brand-color block", sections: "services grid first, then stats row, then process steps" },
      { id: "minimal-swiss", label: "Minimal Swiss", vibe: "bg #ffffff text #111111 surface #f5f5f5 accent single red #dc2626 sparingly; Inter strict grid, uppercase micro-labels", hero: "compact centered hero, thin divider, dual buttons", sections: "process steps first, then image+text split, then services grid" },
      { id: "warm-artisan", label: "Warm artisan", vibe: "bg #fffbeb text #431407 surface #ffffff accent terracotta #ea580c + green #166534; DM Serif headlines, rounded cards", hero: "rounded image card hero with warm gradient wash behind", sections: "testimonial band first, then services grid, then image+text split" },
      { id: "glass-modern", label: "Glass modern", vibe: "bg gradient #0f172a to #312e81 text #f8fafc accent cyan #22d3ee + violet #a78bfa; Outfit headlines, frosted-glass cards", hero: "gradient mesh hero with floating glass CTA card", sections: "stats row first, then services grid, then FAQ accordion" },
      { id: "split-story", label: "Split story", vibe: "bg #f8fafc text #0f172a surface #ffffff accent deep teal #0f766e; Merriweather serif headlines, alternating rows", hero: "asymmetric split hero with overlapping framed image", sections: "alternating image+text rows first, then process steps, then stats row" },
      { id: "compact-local", label: "Compact local", palette: "bg #ffffff text #0f172a surface #f8fafc accent green #16a34a + amber stars #f59e0b", fonts: "Public Sans, big tap targets, sticky call bar", hero: "compact hero, phone CTA primary, review-style trust chips", sections: "trust strip first, then services grid, then quote form" },
      { id: "ocean-clean", label: "Ocean clean", palette: "bg #f0fdfa text #042f2e surface #ffffff accent teal #14b8a6 + navy #0f172a", fonts: "Plus Jakarta Sans, airy spacing", hero: "light airy hero with wave divider and floating service cards", sections: "services grid first, then split story, then stats" },
      { id: "noir-gold", label: "Noir gold", palette: "bg #09090b text #fafafa surface #18181b accent gold #eab308", fonts: "Playfair serif + Inter, letter-spaced eyebrows", hero: "black hero, gold rule, centered luxury headline", sections: "image+text split first, then stats, then testimonial" },
      { id: "fresh-saas", label: "Fresh SaaS", palette: "bg #ffffff text #1e1b4b surface #eef2ff accent indigo #6366f1 + mint #6ee7b7", fonts: "Inter, pill badges, soft shadows", hero: "centered SaaS hero with pill badge + product-style image", sections: "trust row, features grid, then FAQ" },
      { id: "rustic-bold", label: "Rustic bold", palette: "bg #1c0a00 text #fff7ed surface #431407 accent orange #f97316", fonts: "Anton condensed headlines + Inter body", hero: "full-bleed dark photo hero with huge condensed headline", sections: "stats band first, then services, then big CTA" }
    ],
    IMAGE_DEFAULT: "black-forest-labs/flux.1-schnell",
    VIDEO_DEFAULT: "google/veo-3.1-fast",
    EMBEDDING_DEFAULT: "openai/text-embedding-3-small",
    AUDIO_VOICE_DEFAULT: "nova",
    TTS_MODEL_DEFAULT: "openai/tts-1",
    STT_MODEL_DEFAULT: "openai/whisper-large-v3",
    TRANSCRIBE_MODEL_DEFAULT: "openai/gpt-transcribe",
    THREE_D_MODEL_DEFAULT: "microsoft/trellis-2",
  },
  TEXT_CHAT: "/v1/chat/completions",
  IMAGE: "/image",
  AUDIO: "/audio",
  VIDEO: "/video",
  THREE_D: "/3d",
  EMBEDDINGS: "/v1/embeddings",
  MODELS_LIST: "/v1/models",
};

const PROVIDER = "pollinations";

// Classic text endpoint. The Gen endpoint (gen.pollinations.ai) is gated by the
// key's model allow-list: when permissions.models is empty the API answers HTTP
// 200 with an "isn't allowed to use" notice for EVERY model, so Gen can never
// build anything for such a key. The Classic endpoint has no allow-list.
const CLASSIC_CHAT = "/openai";
// Classic free tier serves 1 reply per 30s per IP and answers HTTP 402
// FREE_LIMIT otherwise, so calls are serialized and spaced out.
let classicChain = Promise.resolve();
let classicLastStartedAt = 0;

function classicSlot(minIntervalMs) {
  const previous = classicChain;
  let release;
  classicChain = new Promise((resolve) => { release = resolve; });
  return previous.then(async () => {
    const wait = Math.max(0, classicLastStartedAt + minIntervalMs - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    classicLastStartedAt = Date.now();
  }).finally(() => release());
}

// Per-archetype shell themes — the nav, page background, footer and fonts
// change with the picked design archetype so no two builds share one look.
const SHELL_THEMES = {
  "luxe-dark": { bg: "#0c0a09", ink: "#fafaf9", nav: "#0c0a09", navInk: "#e7e5e4", active: "#d4a437", activeInk: "#0c0a09", fonts: "Fraunces,Georgia,serif", foot: "#0c0a09", footInk: "#a8a29e" },
  "editorial": { bg: "#faf7f2", ink: "#1c1917", nav: "#faf7f2", navInk: "#44403c", active: "#1c1917", activeInk: "#faf7f2", fonts: "Newsreader,Georgia,serif", foot: "#1c1917", footInk: "#d6d3d1" },
  "bold-agency": { bg: "#ffffff", ink: "#0f172a", nav: "#4f46e5", navInk: "#e0e7ff", active: "#bef264", activeInk: "#0f172a", fonts: "'Space Grotesk',Inter,system-ui,sans-serif", foot: "#0f172a", footInk: "#cbd5e1" },
  "minimal-swiss": { bg: "#ffffff", ink: "#111111", nav: "#ffffff", navInk: "#525252", active: "#dc2626", activeInk: "#ffffff", fonts: "Inter,Helvetica,Arial,sans-serif", foot: "#111111", footInk: "#d4d4d4" },
  "warm-artisan": { bg: "#fffbeb", ink: "#431407", nav: "#fffbeb", navInk: "#92400e", active: "#ea580c", activeInk: "#fffbeb", fonts: "'DM Serif Display',Georgia,serif", foot: "#431407", footInk: "#fed7aa" },
  "glass-modern": { bg: "linear-gradient(160deg,#0f172a,#312e81)", ink: "#f8fafc", nav: "rgba(15,23,42,.85)", navInk: "#c7d2fe", active: "#22d3ee", activeInk: "#0f172a", fonts: "Outfit,Inter,system-ui,sans-serif", foot: "#0f172a", footInk: "#a5b4fc" },
  "split-story": { bg: "#f8fafc", ink: "#0f172a", nav: "#0f766e", navInk: "#ccfbf1", active: "#ffffff", activeInk: "#0f766e", fonts: "Merriweather,Georgia,serif", foot: "#042f2e", footInk: "#99f6e4" },
  "compact-local": { bg: "#ffffff", ink: "#0f172a", nav: "#16a34a", navInk: "#f0fdf4", active: "#ffffff", activeInk: "#16a34a", fonts: "'Public Sans',Inter,system-ui,sans-serif", foot: "#052e16", footInk: "#bbf7d0" },
  "ocean-clean": { bg: "#f0fdfa", ink: "#042f2e", nav: "#0f766e", navInk: "#ccfbf1", active: "#14b8a6", activeInk: "#042f2e", fonts: "'Plus Jakarta Sans',Inter,system-ui,sans-serif", foot: "#042f2e", footInk: "#99f6e4" },
  "noir-gold": { bg: "#09090b", ink: "#fafafa", nav: "#09090b", navInk: "#d4d4d8", active: "#eab308", activeInk: "#09090b", fonts: "'Playfair Display',Georgia,serif", foot: "#09090b", footInk: "#a1a1aa" },
  "fresh-saas": { bg: "#ffffff", ink: "#1e1b4b", nav: "#eef2ff", navInk: "#4338ca", active: "#6366f1", activeInk: "#ffffff", fonts: "Inter,system-ui,sans-serif", foot: "#1e1b4b", footInk: "#c7d2fe" },
  "rustic-bold": { bg: "#1c0a00", ink: "#fff7ed", nav: "#1c0a00", navInk: "#fdba74", active: "#f97316", activeInk: "#1c0a00", fonts: "Anton,Impact,sans-serif", foot: "#1c0a00", footInk: "#fdba74" },
  "modern": { bg: "#f8fafc", ink: "#0f172a", nav: "rgba(255,255,255,.94)", navInk: "#334155", active: "#0f172a", activeInk: "#ffffff", fonts: "Inter,system-ui,Arial,sans-serif", foot: "#0f172a", footInk: "#cbd5e1" }
};


function publicPollinationsError(error) {
  if (error instanceof AppError) return error;
  const m = String(error?.message || "").toLowerCase();
  if (m.includes("end of life") || m.includes("end-of-life") || m.includes("decommissioned") || m.includes("retired") || m.includes("no longer supported") || m.includes("not found")) {
    return new AppError("The AI provider endpoint is no longer available. Check POLLINATIONS_API_KEY and retry.", 503, "POLLINATIONS_EOL");
  }
  if (m.includes("401") || m.includes("403") || m.includes("unauthorized") || m.includes("forbidden")) {
    return new AppError("The AI provider key is missing or invalid. Add POLLINATIONS_API_KEY to .env and restart.", 503, "POLLINATIONS_AUTH_FAILED");
  }
  if (m.includes("402") || m.includes("quota") || m.includes("insufficient") || m.includes("credit")) {
    return new AppError("The AI provider free quota is exceeded. Add a valid key or check your balance.", 503, "POLLINATIONS_QUOTA_EXCEEDED");
  }
  if (m.includes("429") || m.includes("rate limit") || m.includes("too many requests")) {
    return new AppError("The AI provider is rate-limiting this request. Pause and retry.", 503, "POLLINATIONS_RATE_LIMITED");
  }
  if (String(error?.name || "").toLowerCase() === "aborterror" || /timed out/i.test(String(error?.message || ""))) {
    return new AppError("The AI provider timed out. Please retry.", 504, "POLLINATIONS_TIMEOUT");
  }
  if (m.includes("404") || m.includes("not found") || m.includes("model not found") || m.includes("endpoint not found")) {
    return new AppError("The AI provider returned a 404. Check the configured model and retry.", 503, "POLLINATIONS_NOT_FOUND");
  }
  return new AppError("The AI provider request failed. Click Generate again to retry.", 503, "POLLINATIONS_UNAVAILABLE");
}

function fetchJson(url, options) {
  return fetch(url, options).then(async (response) => {
    const text = await response.text();
    let payload = null;
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    } else {
      payload = { raw: text };
    }
    if (!response.ok) {
      const status = response.status;
      const message = status === 401 || status === 403 ? "Unauthorized" : text ? String(text).slice(0, 200) : "Request failed";
      const error = new Error(message);
      error.name = "POLLINATIONS_" + status;
      error.status = status;
      error.code = "POLLINATIONS_" + status;
      throw error;
    }
    return payload;
  });
}

export class PollinationsService {
  constructor() {
    // Set once a Gen model is refused; then every request goes to Classic.
    this.genDenied = false;
    this.refreshConfig();
  }

  refreshConfig() {
    this.baseUrl = String(env.pollinations.baseUrl || POLLINATIONS.GEN_BASE).replace(/\/$/, "");
    this.configured = Boolean(env.pollinations.apiKey);
    return this;
  }

  configured() {
    return Boolean(env.pollinations.apiKey);
  }

  setKey(key) {
    if (key) env.pollinations.apiKey = key;
    this.refreshConfig();
  }

  authHeaders(extra = {}) {
    const key = env.pollinations.apiKey;
    return { ...(key ? { Authorization: "Bearer " + key } : {}), ...extra };
  }

  // One Classic call. Classic returns the OpenAI chat-completions shape with
  // the answer in choices[0].message.content and the chain of thought in
  // choices[0].message.reasoning.
  async classicOnce(messages, options = {}) {
    const {
      temperature = 0.6,
      maxTokens = 2000,
      model = env.pollinations.classicModel || "openai-fast",
      timeoutMs = env.pollinations.classicTimeoutMs || 150000,
    } = options;
    const body = {
      model,
      messages,
      max_tokens: Math.min(Math.max(Number(maxTokens) || 2000, 100), 16000),
      temperature: Number(temperature ?? 0.6),
      stream: false,
      // The default reasoning mode burns the whole 1500-token Classic budget on
      // chain-of-thought and returns finish_reason "length" with no content.
      // "low" keeps the reasoning negligible so the answer itself is complete.
      reasoning_effort: "low",
    };
    const url = String(env.pollinations.classicBaseUrl || "https://text.pollinations.ai").replace(/\/$/, "") + CLASSIC_CHAT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || 150000));
    try {
      const response = await fetchJson(url, {
        method: "POST",
        signal: controller.signal,
        headers: this.authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
        body: JSON.stringify(body),
      });
      const message = (response.choices && Array.isArray(response.choices) ? response.choices[0] : {}) || {};
      const msg = message.message || {};
      const content = msg.content !== undefined ? String(msg.content ?? "") : String(message.text ?? "");
      if (!content || !content.trim()) {
        throw new AppError("Pollinations Classic returned an empty response.", 503, "POLLINATIONS_EMPTY");
      }
      return {
        configured: true,
        provider: PROVIDER,
        model,
        content,
        usage: response.usage || null,
        cached: false,
        finishReason: message.finish_reason || null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Serialized + spaced Classic call (1 reply per 30s on the free tier).
  async classicText(messages, options = {}) {
    const minInterval = Number(env.pollinations.classicMinIntervalMs) || 31000;
    await classicSlot(minInterval);
    return this.classicOnce(messages, options);
  }

  resolveTextModels(requested, fallbackPool) {
    const models = [requested, ...(Array.isArray(fallbackPool) ? fallbackPool : [])]
      .map((m) => String(m || "").trim())
      .filter(Boolean);
    return [...new Set(models)].slice(0, 7);
  }

  async send(domain, payload = {}, options = {}) {
    if (!this.configured) {
      throw new AppError("Real AI requires POLLINATIONS_API_KEY in .env.", 503, "POLLINATIONS_NOT_CONFIGURED");
    }
    switch (domain) {
      case "text":
        return this.text(payload, options);
      case "image":
        return this.image(payload, options);
      case "audio":
        return this.audio(payload, options);
      case "video":
        return this.video(payload, options);
      case "3d":
        return this._3d(payload, options);
      case "embeddings":
        return this.embeddings(payload, options);
      default:
        throw new AppError("Unknown AI domain: " + domain, 400, "POLLINATIONS_INVALID_DOMAIN");
    }
  }

  async text(messages, options = {}) {
    const {
      temperature = 0.5,
      maxTokens = 2000,
      topP = 1,
      model = process.env.POLLINATIONS_TEXT_MODEL || POLLINATIONS.MODELS.TEXT_DEFAULT,
      fallbackModels = POLLINATIONS.MODELS.TEXT_FALLBACKS,
      timeoutMs = 60000,
      safe = undefined,
    } = options;
    const cleanMessages = Array.isArray(messages) ? messages : [{ role: "user", content: String(messages ?? "") }];
    // Creator-identity questions are answered locally: guaranteed correct,
    // zero token cost, works even when the upstream key has no model access.
    const lastUser = [...cleanMessages].reverse().find((m) => m && m.role === "user");
    if (lastUser && isCreatorQuestion(lastUser.content)) {
      const a = creatorAnswer();
      return { provider: PROVIDER, model: "brand-identity", content: a.content, usage: null, cached: false, intent: a.intent };
    }
    const queue = this.resolveTextModels(model, fallbackModels);
    const safety = safe === undefined || safe === null || safe === false || safe === 0 ? {} : { safe: Array.isArray(safe) ? safe.join(",") : String(safe) };
    let lastError = null;
    const deniedModels = [];
    // Once the key's allow-list is known to be empty, every later Gen model
    // attempt is a guaranteed refusal, so skip straight to Classic.
    if (this.genDenied && options.classicFallback !== false) {
      try {
        return await this.classicText(cleanMessages, {
          temperature,
          maxTokens,
          model: env.pollinations.classicModel || "openai-fast",
          timeoutMs: Math.max(timeoutMs, env.pollinations.classicTimeoutMs || 150000),
        });
      } catch (classicError) {
        throw publicPollinationsError(classicError);
      }
    }
    for (const attempt of queue) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(5000, Number(timeoutMs) || 60000));
      try {
        const body = {
          model: attempt,
          messages: cleanMessages,
          max_tokens: Math.min(Math.max(Number(maxTokens) || 2000, 100), 8192),
          temperature: Number(temperature ?? 0.5),
          top_p: Number(topP ?? 1),
          stream: false,
          ...safety,
        };
        const response = await fetchJson(this.baseUrl + POLLINATIONS.TEXT_CHAT, {
          method: "POST",
          signal: controller.signal,
          headers: this.authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
          body: JSON.stringify(body),
        });
        let content = null;
        if (response.output !== undefined) content = String(response.output || "");
        else if (response.output_text !== undefined) content = String(response.output_text || "");
        else if (response.choices && Array.isArray(response.choices)) {
          const c = response.choices[0] || {};
          if (c.message && c.message.content !== undefined) content = String(c.message.content ?? "");
          else if (c.text !== undefined) content = String(c.text ?? "");
          else if (typeof c.content === "string") content = c.content;
        } else if (response.content !== undefined) content = String(response.content || "");
        else if (response.text !== undefined) content = String(response.text || "");
        if (!content || !String(content).trim()) {
          throw new AppError("Pollinations AI returned an empty response.", 503, "POLLINATIONS_EMPTY");
        }
        // Pollinations returns HTTP 200 with a block notice embedded in the message
        // content when the model allow-list of the key does not include the requested model.
        if (/isn.t allowed to use|is not allowed to use|allow it for this key/i.test(String(content))) {
          const grantMatch = String(content).match(/https:\/\/enter\.pollinations\.ai\/grant\?[^\s)\]">]+/);
          deniedModels.push({ model: attempt, grant: grantMatch ? grantMatch[0] : "https://enter.pollinations.ai/keys" });
          // A refused model means the key's allow-list does not cover it.
          this.genDenied = true;
          lastError = new AppError("Pollinations key cannot use " + attempt + "; its model allow-list does not include it.", 503, "POLLINATIONS_MODEL_DENIED");
          continue;
        }
        return { configured: true, provider: PROVIDER, model: attempt, content, usage: response.usage || null, cached: false };
      } catch (error) {
        lastError = error;
        const msg = String(error?.message || "").toLowerCase();
        // Auth/quota/config mistakes should surface immediately, not burn retries.
        if (/unauthorized|forbidden|invalid api key|not_configured|402|quota|insufficient/i.test(msg)) break;
      } finally {
        clearTimeout(timer);
      }
    }
    if (deniedModels.length && deniedModels.length === queue.length) {
      // The key's model allow-list covers none of the Gen models. The Classic
      // endpoint has no allow-list, so it can still serve the request.
      if (options.classicFallback !== false) {
        try {
          return await this.classicText(cleanMessages, {
            temperature,
            maxTokens,
            model: env.pollinations.classicModel || "openai-fast",
            timeoutMs: Math.max(timeoutMs, env.pollinations.classicTimeoutMs || 150000),
          });
        } catch (classicError) {
          // Classic is the only usable path here, so surface ITS error
          // (rate limit, timeout, ...) instead of the misleading
          // "model not allowed" message that hides the real cause.
          throw publicPollinationsError(classicError);
        }
      }
      throw new AppError("Pollinations key is not allowed to use any of: " + queue.join(", ") + " (its model allow-list covers none of them). Owner fix: open " + deniedModels[0].grant + " and allow the text category for this key - or set a full-access secret (sk_) key as POLLINATIONS_API_KEY. You can also pin one allowed model via POLLINATIONS_TEXT_MODEL / POLLINATIONS_WEBSITE_MODEL, then retry.", 503, "POLLINATIONS_MODEL_DENIED");
    }
    // Any other Gen failure (quota, empty body, upstream error) can still be
    // served by Classic, which has neither the allow-list nor the same quota.
    if (options.classicFallback !== false) {
      try {
        return await this.classicText(cleanMessages, {
          temperature,
          maxTokens,
          model: env.pollinations.classicModel || "openai-fast",
          timeoutMs: Math.max(timeoutMs, env.pollinations.classicTimeoutMs || 150000),
        });
      } catch (classicError) {
        lastError = classicError;
      }
    }
    throw publicPollinationsError(lastError || new Error("Pollinations AI request failed."));
  }

  async image(payload = {}, options = {}) {
    const {
      prompt, model = POLLINATIONS.MODELS.IMAGE_DEFAULT, seed = null,
      width = null, height = null, nologo = true, safe = undefined, referrer = null,
    } = payload;
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) throw new AppError("Image prompt is required.", 400, "POLLINATIONS_INVALID_IMAGE");
    let url = this.baseUrl + POLLINATIONS.IMAGE + "/" + encodeURIComponent(cleanPrompt);
    const params = new URLSearchParams();
    params.set("model", String(model || POLLINATIONS.MODELS.IMAGE_DEFAULT));
    if (seed !== null && seed !== undefined && String(seed) !== "") params.set("seed", String(seed));
    if (width) params.set("width", String(width));
    if (height) params.set("height", String(height));
    if (nologo !== false) params.set("nologo", "true");
    if (safe !== undefined && safe !== null && safe !== false && safe !== 0 && safe !== "") {
      params.set("safe", Array.isArray(safe) ? safe.join(",") : String(safe));
    }
    if (referrer) params.set("referrer", String(referrer));
    if (env.pollinations.apiKey) params.set("key", env.pollinations.apiKey);
    url += "?" + params.toString();
    const response = await fetch(url, { headers: { ...this.authHeaders(), Accept: "image/*" }, signal: options.signal });
    if (!response.ok) throw publicPollinationsError(new Error("Image request failed: " + response.status));
    const arrayBuffer = await response.arrayBuffer();
    return { provider: PROVIDER, model: String(model), format: response.headers.get("content-type") || "image/jpeg", data: Buffer.from(arrayBuffer).toString("base64"), url };
  }

  async audio(payload = {}, options = {}) {
    // Pollinations simple TTS/music endpoint: GET /audio/{text}?model=&voice=
    const { text, model = null, voice = POLLINATIONS.MODELS.AUDIO_VOICE_DEFAULT } = payload;
    const cleanText = String(text || "").trim();
    if (!cleanText) throw new AppError("Audio text is required.", 400, "POLLINATIONS_INVALID_AUDIO");
    let url = this.baseUrl + POLLINATIONS.AUDIO + "/" + encodeURIComponent(cleanText);
    const params = new URLSearchParams();
    if (model) params.set("model", String(model));
    if (voice) params.set("voice", String(voice));
    if (env.pollinations.apiKey) params.set("key", env.pollinations.apiKey);
    url += "?" + params.toString();
    const response = await fetch(url, { headers: { ...this.authHeaders(), Accept: "audio/*" }, signal: options.signal });
    if (!response.ok) throw publicPollinationsError(new Error("Audio request failed: " + response.status));
    const arrayBuffer = await response.arrayBuffer();
    return { provider: PROVIDER, model: String(model || "audio-default"), voice: String(voice || ""), format: response.headers.get("content-type") || "audio/mpeg", data: Buffer.from(arrayBuffer).toString("base64"), url };
  }

  async transcribeAudio(payload = {}, options = {}) {
    // OpenAI-compatible speech-to-text: POST /v1/audio/transcriptions (multipart or JSON with file/url/audio).
    const { model = POLLINATIONS.MODELS.STT_MODEL_DEFAULT, file = null, url = null, audio = null, language = null } = payload;
    const endpoint = this.baseUrl + "/v1/audio/transcriptions";
    if (file && typeof file === "object" && (file.buffer || file.path || file.stream)) {
      const form = new FormData();
      form.append("model", String(model));
      const blob = file.buffer ? new Blob([file.buffer], { type: file.mimetype || "audio/mpeg" }) : file.stream;
      form.append("file", blob, file.name || "audio.mp3");
      if (language) form.append("language", String(language));
      const headers = this.authHeaders();
      delete headers["Content-Type"];
      const response = await fetchJson(endpoint, { method: "POST", headers, body: form, signal: options.signal });
      const text = response.text ?? response.transcription ?? response.data ?? "";
      return { provider: PROVIDER, model: String(model), text: String(text || ""), raw: response };
    }
    const response = await fetchJson(endpoint, {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify({ model: String(model), ...(url ? { url } : {}), ...(audio ? { audio } : {}), ...(language ? { language } : {}) }),
      signal: options.signal,
    });
    const text = response.text ?? response.transcription ?? response.data ?? "";
    return { provider: PROVIDER, model: String(model), text: String(text || ""), raw: response };
  }

  async speak(payload = {}, options = {}) {
    // OpenAI-compatible TTS: POST /v1/audio/speech -> binary audio body.
    const { model = POLLINATIONS.MODELS.TTS_MODEL_DEFAULT, input, voice = POLLINATIONS.MODELS.AUDIO_VOICE_DEFAULT, response_format = "mp3" } = payload;
    const cleanInput = String(input || "").trim();
    if (!cleanInput) throw new AppError("Speech input text is required.", 400, "POLLINATIONS_INVALID_SPEECH");
    const response = await fetch(this.baseUrl + "/v1/audio/speech", {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json", Accept: "audio/*" }),
      body: JSON.stringify({ model: String(model), input: cleanInput, voice: String(voice), response_format }),
      signal: options.signal,
    });
    if (!response.ok) throw publicPollinationsError(new Error("Speech request failed: " + response.status));
    const arrayBuffer = await response.arrayBuffer();
    return { provider: PROVIDER, model: String(model), voice: String(voice), format: response.headers.get("content-type") || "audio/mpeg", data: Buffer.from(arrayBuffer).toString("base64") };
  }

  async video(payload = {}, options = {}) {
    const { prompt, model = POLLINATIONS.MODELS.VIDEO_DEFAULT, duration = null, image = null, seed = null } = payload;
    const cleanPrompt = String(prompt || "").trim();
    if (!cleanPrompt) throw new AppError("Video prompt is required.", 400, "POLLINATIONS_INVALID_VIDEO");
    let url = this.baseUrl + POLLINATIONS.VIDEO + "/" + encodeURIComponent(cleanPrompt);
    const params = new URLSearchParams();
    if (model) params.set("model", String(model));
    if (duration !== null && duration !== undefined && String(duration) !== "") params.set("duration", String(duration));
    if (seed !== null && seed !== undefined && String(seed) !== "") params.set("seed", String(seed));
    if (Array.isArray(image)) image.filter(Boolean).forEach((u) => params.append("image", String(u)));
    else if (image) params.set("image", String(image));
    if (env.pollinations.apiKey) params.set("key", env.pollinations.apiKey);
    url += "?" + params.toString();
    const response = await fetch(url, { headers: { ...this.authHeaders(), Accept: "video/*" }, signal: options.signal });
    if (!response.ok) throw publicPollinationsError(new Error("Video request failed: " + response.status));
    const arrayBuffer = await response.arrayBuffer();
    return { provider: PROVIDER, model: String(model), format: response.headers.get("content-type") || "video/mp4", data: Buffer.from(arrayBuffer).toString("base64"), url };
  }

  async _3d(payload = {}, options = {}) {
    // GET /3d/{prompt}?model=&image=&resolution= — Trellis family uses the image, not the text.
    const { prompt = "no_prompt_for_trellis_needed", model = POLLINATIONS.MODELS.THREE_D_MODEL_DEFAULT, image = null, resolution = "low" } = payload;
    const cleanPrompt = String(prompt || "no_prompt_for_trellis_needed").trim() || "no_prompt_for_trellis_needed";
    let url = this.baseUrl + POLLINATIONS.THREE_D + "/" + encodeURIComponent(cleanPrompt);
    const params = new URLSearchParams();
    if (model) params.set("model", String(model));
    if (resolution) params.set("resolution", String(resolution));
    if (image) params.set("image", String(image));
    if (env.pollinations.apiKey) params.set("key", env.pollinations.apiKey);
    url += "?" + params.toString();
    const response = await fetch(url, { headers: { ...this.authHeaders(), Accept: "model/gltf-binary,model/*" }, signal: options.signal });
    if (!response.ok) throw publicPollinationsError(new Error("3D request failed: " + response.status));
    const arrayBuffer = await response.arrayBuffer();
    return { provider: PROVIDER, model: String(model), format: response.headers.get("content-type") || "model/gltf-binary", data: Buffer.from(arrayBuffer).toString("base64"), url };
  }

  async embeddings(payload = {}, options = {}) {
    const { model = POLLINATIONS.MODELS.EMBEDDING_DEFAULT, input, dimensions = null, encoding_format = "float" } = payload;
    if (input === undefined || input === null || (typeof input === "string" && !input.trim() && !Array.isArray(input))) {
      throw new AppError("Embedding input is required.", 400, "POLLINATIONS_INVALID_EMBEDDING");
    }
    const items = Array.isArray(input) ? input : [input];
    if (items.length > 32) throw new AppError("Embedding batch input supports up to 32 items.", 400, "POLLINATIONS_INVALID_EMBEDDING");
    const body = { model: String(model), input: items };
    if (dimensions !== null && dimensions !== undefined && String(dimensions) !== "") body.dimensions = Number(dimensions);
    if (encoding_format) body.encoding_format = encoding_format;
    const url = this.baseUrl + POLLINATIONS.EMBEDDINGS;
    const response = await fetchJson(url, {
      method: "POST",
      headers: this.authHeaders({ "Content-Type": "application/json", Accept: "application/json" }),
      body: JSON.stringify(body),
      signal: options.signal,
    });
    const data = response.data || response.embeddings || [];
    return { provider: PROVIDER, model: String(model), count: Array.isArray(data) ? data.length : 0, data, usage: response.usage || null };
  }

  async listModels(params = {}, options = {}) {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && String(v) !== "") search.set(k, String(v));
    }
    const url = this.baseUrl + POLLINATIONS.MODELS_LIST + (search.toString() ? "?" + search.toString() : "");
    return fetchJson(url, { headers: this.authHeaders({ Accept: "application/json" }), signal: options.signal });
  }

  pickDesignSystem(style, palette) {
    const s = String(style || "modern").toLowerCase();
    const systems = {
      modern: "MODERN PREMIUM: airy white canvas, huge confident headline left + hero image right in a rounded card, accent underline on one word, pill CTAs, 3 feature cards with soft shadows, stats row (numbers), generous whitespace.",
      luxury: "LUXURY DARK: near-black canvas (#0c0a09), gold serif headlines, thin dividers, hero image full-bleed with dark gradient overlay, letter-spaced eyebrow, minimal text, high contrast, elegant restraint.",
      medical: "CLEAN MEDICAL: clinical white + soft blue panels, trust badges row first, card grid with icons, opening-hours table, emergency call banner, calm blues, rounded friendly cards.",
      restaurant: "WARM RESTAURANT: cream/terracotta canvas, big appetizing hero image, menu-style price list section, opening hours card, reservation CTA, warm serif accents, cozy copy.",
      bold: "BOLD AGENCY: oversized display type, duotone color blocks, diagonal or offset section rhythm, marquee-style strip, giant numbers, confident punchy one-liners.",
      minimal: "MINIMAL ELEGANT: monochrome + one accent, single-column rhythm, huge whitespace, small caps labels, one hero image, quiet typography-led design."
    };
    return systems[s] || systems.modern;
  }

  fallbackPageFragment(spec, lead, hero, gallery, isHome, archId) {
    const t = SHELL_THEMES[archId] || SHELL_THEMES.modern;
    const name = String(lead?.name || "Your Business");
    const type = String(lead?.businessType || lead?.category || "Local Business");
    const address = String(lead?.address || "");
    const phone = String(lead?.phone || "");
    const email = String(lead?.email || "");
    const card = (h, p) => "<div style=\"background:" + t.nav + ";color:" + t.navInk + ";border:1px solid rgba(128,128,128,.25);border-radius:16px;padding:22px;box-shadow:0 6px 20px rgba(15,23,42,.06)\"><h3 style=\"margin:.1em 0 .3em\">" + h + "</h3><p style=\"margin:0;opacity:.85\">" + p + "</p></div>";
    // The fallback must carry every section the AI pages are asked for, so a
    // failed page still ships a usable site instead of a bare heading.
    const style = "<style>.fb-hero{display:grid;gap:10px;padding:18px 0}.fb-stats{display:flex;gap:18px;flex-wrap:wrap;padding:16px 0}.fb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;padding:14px 0}.fb-faq{padding:14px 0}.fb-form{display:grid;gap:10px;max-width:520px;padding:14px 0}</style>";
    const stats = "<div class=\"fb-stats\"><div><b>Services</b><br>Add verified offerings</div><div><b>Contact</b><br>Use confirmed channels</div><div><b>Details</b><br>Keep information current</div><div><b>Next step</b><br>Make it easy to enquire</div></div>";
    const cards = "<div class=\"fb-cards\">" + card("Services and details", "Add clear, verified information about the work you offer.") + card("Simple next steps", "Help visitors call, email, or request information with confidence.") + card("Business information", "Keep service areas, hours, and customer proof accurate.") + "</div>";
    const faq = "<div class=\"fb-faq\"><h2>Frequently asked questions</h2><details><summary>What services are available?</summary><p>Contact the business for current service details.</p></details><details><summary>How can I get started?</summary><p>Use a verified contact method to discuss your needs.</p></details><details><summary>Where can I find more information?</summary><p>Ask the business for availability, pricing, and next steps.</p></details></div>";
    const form = "<form class=\"fb-form\" id=\"quote\"><h2>Send an enquiry</h2><input type=\"text\" name=\"name\" placeholder=\"Your name\" required><input type=\"email\" name=\"email\" placeholder=\"Your email\" required><input type=\"tel\" name=\"phone\" placeholder=\"Your phone\"><textarea name=\"message\" rows=\"4\" placeholder=\"How can we help?\"></textarea><button type=\"submit\">Send enquiry</button></form>";
    if (isHome) {
      const phoneCta = phone ? "<a class=\"btn btn-p\" href=\"tel:" + phone + "\">Call us</a>" : "";
      const locationLine = address ? address + ". " : "";
      return style + "<div class=\"fb-hero\"><span class=\"kick\">" + type + "</span><h1>" + name + "</h1><p class=\"lead\">" + locationLine + "Explore current business details and choose a verified way to get in touch.</p><div class=\"cta-row\">" + phoneCta + "<a class=\"btn btn-g\" href=\"#quote\">Contact us</a></div></div><img src=\"" + hero + "\" alt=\"" + name + "\" loading=\"lazy\" style=\"width:100%;max-height:420px;object-fit:cover;display:block;border-radius:16px\">" + stats + cards + faq + form;
    }
    return style + "<h1>" + spec.title + "</h1><p>" + spec.focus + "</p><img src=\"" + hero + "\" alt=\"" + name + " — " + spec.title + "\" loading=\"lazy\" style=\"width:100%;max-height:380px;object-fit:cover;display:block;border-radius:16px\">" + stats + cards + faq + form;
  }

  assembleMultiPage(pages, business, accent, archId) {
    const t = SHELL_THEMES[archId] || SHELL_THEMES.modern;
    const e = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const navLinks = pages.map((p, i) => "<a href=\"#pg-" + i + "\" class=\"nav-a" + (i === 0 ? " active" : "") + "\">" + e(p.title) + "</a>").join("");
    const sections = pages.map((p, i) => "<section class=\"pg\" id=\"pg-" + i + "\"" + (i === 0 ? "" : " style=\"display:none\"") + ">" + p.body + "</section>").join("");
    // Neutral frame only: nav + page switcher + footer. The AI's own classes
    // carry the design, so each style (modern/luxury/medical/restaurant/bold)
    // renders its own distinct look instead of one forced navy theme.
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + e(business) + "</title><meta name=\"description\" content=\"Learn about " + e(business) + " and get in touch.\"><style>*{box-sizing:border-box}body{margin:0;font-family:" + t.fonts + ";color:" + t.ink + ";background:" + t.bg + ";line-height:1.55}img{max-width:100%;height:auto}.nav{position:sticky;top:0;z-index:50;background:" + t.nav + ";display:flex;gap:6px;align-items:center;padding:10px 16px;flex-wrap:wrap;box-shadow:0 1px 8px rgba(15,23,42,.08);backdrop-filter:blur(8px)}.nav-a{color:" + t.navInk + ";text-decoration:none;font-weight:600;padding:8px 13px;border-radius:9px;font-size:.9rem}.nav-a.active,.nav-a:hover{background:" + t.active + ";color:" + t.activeInk + "}.nav .brand{font-weight:800;margin-right:auto;font-size:1.02rem}.pg{max-width:1120px;margin:0 auto;padding:26px 20px 40px}.site-foot{background:" + t.foot + ";color:" + t.footInk + ";text-align:center;padding:24px;font-size:.88rem}form.site-form{display:grid;gap:10px;max-width:520px}input,textarea,select{padding:12px;border:1px solid #cbd5e1;border-radius:10px;font:inherit;width:100%}button{cursor:pointer}</style></head><body><nav class=\"nav\"><span class=\"brand\">" + e(business) + "</span>" + navLinks + "</nav>" + sections + "<footer class=\"site-foot\">© " + new Date().getFullYear() + " " + e(business) + ". All rights reserved.</footer></body></html>";
  }

  async buildWebsite(lead = {}, options = {}) {
    const imgs = options.images || {};
    const heroImg = String(imgs.hero || "").trim();
    const galleryImgs = Array.isArray(imgs.gallery) ? imgs.gallery.map((g) => String(g || "").trim()).filter(Boolean).slice(0, 6) : [];
    const seedWord = String(lead.businessType || lead.category || options.businessName || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "business";
    const autoHero = "https://picsum.photos/seed/" + encodeURIComponent(seedWord) + "/1600/900";
    const autoGallery = [1, 2, 3].map((n) => "https://picsum.photos/seed/" + encodeURIComponent(seedWord + "-" + n) + "/800/600");
    const hero = heroImg || autoHero;
    const gallery = galleryImgs.length ? galleryImgs : autoGallery;
    const accentMap = { emerald: "#22c55e", blue: "#2563eb", gold: "#d4af37", rose: "#e11d48", teal: "#14b8a6", purple: "#7c3aed", orange: "#f97316" };
    const accent = accentMap[options.palette] || "#22c55e";
    const pageCount = Math.min(4, Math.max(1, parseInt(options.pages, 10) || 1));
    // Keep each focus SHORT. A long focus listing extra bands (gallery,
    // testimonial, pricing...) made the model append a seventh section, which
    // pushed the reply past Classic's ~1500 token cap.
    const allSpecs = [
      { id: "home", title: "Home", focus: "headline and CTAs for this business" },
      { id: "about", title: "About", focus: "the business story and why choose us" },
      { id: "services", title: "Services", focus: "the services this business offers" },
      { id: "contact", title: "Contact", focus: "how to reach and contact this business" }
    ];
    const pageSpecs = allSpecs.slice(0, pageCount);
    const business = String(lead.name || options.businessName || "Your Business");
    const archList = POLLINATIONS.MODELS.DESIGN_ARCHETYPES;
    const archWanted = String(options.design || "").trim().toLowerCase();
    const archFound = archList.find((a) => String(a.id || "").toLowerCase() === archWanted || String(a.label || "").toLowerCase() === archWanted);
    const briefObedient = options.followBrief !== false;
    const archPick = briefObedient ? (archFound || archList[Math.floor(Math.random() * archList.length)]) : archList[Math.floor(Math.random() * archList.length)];
    const designDirection = this.pickDesignSystem(options.style, options.palette) + " Design archetype this build: " + archPick.label + " (" + archPick.vibe + "). " + (briefObedient ? "STRICT BRIEF MODE: obey every design/style/page/EXTRA instruction exactly — the user ticked Follow, so fidelity to their brief outranks novelty." : "FREE PRO MODE: the user unticked Follow — ignore rigid brief constraints and freely design the single best website for this specific business type and audience: choose the most persuasive sections, the strongest offer framing, and the highest-converting layout you know. Commit fully to that archetype's vibe — a returning customer must see a visibly different design, not the same template with new words.");
    const varietySeed = Math.floor(Math.random() * 9000) + 1000;
    const layoutVariants = ["split hero (text left, image right)", "full-bleed image hero with overlay headline", "centered type hero with image band below"];
    const layoutPick = layoutVariants[varietySeed % layoutVariants.length];
    const briefExtra = [];
    const bx = (v, n) => String(v || "").trim().slice(0, n);
    if (bx(options.design, 40)) briefExtra.push("DESIGN=" + bx(options.design, 40));
    if (bx(options.tone, 40)) briefExtra.push("TONE=" + bx(options.tone, 40));
    if (bx(options.targetAudience, 400)) briefExtra.push("AUDIENCE=" + bx(options.targetAudience, 400));
    if (bx(options.primaryGoal, 40)) briefExtra.push("GOAL=" + bx(options.primaryGoal, 40));
    if (bx(options.location, 160)) briefExtra.push("LOCATION=" + bx(options.location, 160));
    if (bx(options.services, 900)) briefExtra.push("SERVICES=" + bx(options.services, 900));
    if (bx(options.cta, 140)) briefExtra.push("CTA=" + bx(options.cta, 140));
    if (bx(options.about, 900)) briefExtra.push("ABOUT=" + bx(options.about, 900));
    if (bx(options.language, 40)) briefExtra.push("LANGUAGE=" + bx(options.language, 40));
    const brief = JSON.stringify({ business, type: lead.businessType || lead.category, address: lead.address, phone: lead.phone, email: lead.email, style: options.style || "modern", colors: options.palette || "emerald", images: { hero, gallery } }).slice(0, 1500) + (briefExtra.length ? " EXTRA:" + briefExtra.join("|") : "");
    // Compact prompt. The Classic endpoint caps a reply at ~1500 tokens TOTAL,
    // so the previous multi-paragraph brief (long design system + full page
    // brief) left too little room for the page itself and the model stopped at
    // finish_reason "length". Keep the prompt tiny, name a fixed set of
    // sections, and let the retry ask for a shorter page.
    const request = (maxTokens, note, targetSpecs = pageSpecs, terse = false) => {
      const spec = targetSpecs[0] || {};
      // Each page gets its OWN class prefix: a <style> block applies document-wide
      // even when its parent page is hidden, so a shared prefix would let one
      // page's rules restyle another page.
      const slug = (String(business).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 12) || "site")
        + "-" + String(spec.id || targetSpecs.indexOf(spec) + 1).toLowerCase().replace(/[^a-z0-9]+/g, "");
      const tone = terse ? " Write SHORT copy (max 12 words per paragraph, no extra sections)." : "";
      const system = "You are a web designer. Output ONLY the inner HTML of ONE website page. "
        + "Style: " + (terse ? String(archPick.label) + " colors " + accent + "." : designDirection + " " + layoutPick + ".") + " "
        + "Page " + (spec.title || "Home") + ": " + (spec.focus || "") + ". "
        + "Use class prefix ." + slug + "-. "
        + "Structure, in this order: (1) <style> with at most 10 one-line rules using only ." + slug + "- classes; "
        + "(2) hero: h1, one sentence, two <a> buttons; (3) four compact detail blocks with no invented metrics; "
        + "(4) 3 cards, each h3 + one short line + link; (5) one <img> + short text; "
        + "(6) 3 <details> FAQ items; (7) <form> with name, email, phone, message and a submit button. "
        + "Use the image URLs given. Add NO other sections (no gallery, no testimonials, no pricing, no extra lists) and no second <style> block. "
        + "Never invent ratings, review counts, years, prices, credentials, guarantees, service areas, availability, names, or response times. Use only supplied facts; omit unknown facts. No scripts, inline event handlers, markdown, explanation, html/head/body/nav, or <!--PAGE--> marker. "
        + "Be brief so the page fits in 900 tokens. Finish every section." + tone;
      const user = terse
        ? "Business: " + brief + ". Build page \"" + (spec.title || "Home") + "\"."
        : "Business: " + brief + ". Build page \"" + (spec.title || "Home") + "\" using the image URLs exactly.";
      return this.text([{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.85, maxTokens, timeoutMs: Math.max(60000, 120000), model: process.env.POLLINATIONS_WEBSITE_MODEL || POLLINATIONS.MODELS.WEBSITE_DEFAULT, fallbackModels: POLLINATIONS.MODELS.WEBSITE_FALLBACKS });
    };
    // One request per page. The Classic endpoint caps a reply at ~1500 tokens,
    // so asking for every page in one call truncates the last page mid-section.
    // Per-page calls keep each page complete on every provider.
    const pageBodies = [];
    let result = null;
    for (let i = 0; i < pageSpecs.length; i++) {
      const spec = pageSpecs[i];
      let pageContent = "";
      let truncated = false;
      try {
        const attempt = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_FIRST, "", [spec]);
        pageContent = String(attempt.content || "");
        truncated = String(attempt.finishReason || "").toLowerCase() === "length";
        if (!result) result = attempt;
      } catch (error) {
        if (!result) throw error;
      }
      // A page cut off by the token cap leaves dangling tags; close them so the
      // section still renders instead of swallowing the rest of the document.
      let repaired = repairTruncatedHtml(pageContent);
      if (repaired.repaired) { pageContent = repaired.html; truncated = true; }
      // Truncated or too thin: retry with the terse prompt, which asks for a
      // shorter page that fits the cap instead of repeating the same overflow.
      // Retry when the page was cut off, is too thin, or is missing a required
      // section (the FAQ or contact form are the usual casualties of a cut reply).
      const missingSections = missingPageSections(pageContent);
      if (truncated || missingSections.length || !hasRealContent(pageContent) || visibleWordCount(pageContent) < 60) {
        try {
          const retry = await request(POLLINATIONS.MODELS.WEBSITE_TOKENS_RETRY, "", [spec], true);
          const retryBody = repairTruncatedHtml(String(retry.content || ""));
          const retryMissing = missingPageSections(retryBody.html);
          // Prefer the retry when it is more complete; otherwise keep the original.
          const better = retryMissing.length < missingSections.length
            || (retryMissing.length === missingSections.length && retryBody.html.length > pageContent.length)
            || (missingSections.length > 0 && retryMissing.length === 0);
          if (better) {
            pageContent = retryBody.html;
            if (!result) result = retry;
          }
        } catch {
          /* keep the first attempt */
        }
      }
      pageBodies.push(pageContent);
    }
    const fragments = pageBodies.map((s) => String(s || "").trim());
    const pages = pageSpecs.map((spec, i) => ({ ...spec, body: hasRealContent(fragments[i]) ? fragments[i] : this.fallbackPageFragment(spec, lead, hero, gallery, i === 0, archPick.id) }));
    return { ...result, html: this.assembleMultiPage(pages, business, accent, archPick.id), pageCount: pages.length };
  }

  refineWebsite(currentHtml, instruction, meta = {}) {
    const instructions = [
      { role: "system", content: "You are an elite website editor AI. Return ONLY the complete updated HTML file with inline CSS. Do not use scripts, event handler attributes, invented claims, or unverified business facts." },
      { role: "user", content: "Current site for " + (meta.businessName || meta.leadName || "business") + ":\n" + String(currentHtml || "").slice(0, 6000) + "\n\nRequested change: " + String(instruction || "").slice(0, 800) + "\n\nReturn only the full updated HTML." }
    ];
    return this.text(instructions, { temperature: 0.3, maxTokens: 1100, timeoutMs: 18000 })
      .then((r) => ({ ...r, html: r.content }))
      .catch((error) => {
        throw publicPollinationsError(error);
      });
  }
}

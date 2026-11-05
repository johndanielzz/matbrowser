import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { isFirebaseConfigured } from "./config/firebase.js";
import { AdminService } from "./services/adminService.js";
import { AuthService } from "./services/authService.js";
import { BillingService } from "./services/billingService.js";
import { CrmService } from "./services/crmService.js";
import { DashboardService } from "./services/dashboardService.js";
import { AiAgentService } from "./services/aiAgentService.js";
import { LeadService } from "./services/leadService.js";
import { NvidiaService } from "./services/nvidiaService.js";
import { WebsiteService } from "./services/websiteService.js";
import { EarnService } from "./services/earnService.js";
import { GigService } from "./services/gigService.js";
import { SavedSearchService } from "./services/savedSearchService.js";
import { SocialService } from "./services/socialService.js";
import { isAdminUser } from "./utils/entitlements.js";
import { AppError } from "./utils/errors.js";
import { aiSchemas, authSchemas, billingSchema, crmSchemas, earnSchemas, gigSchemas, leadSearchSchema, paypalConfirmationSchema, profileSchema, savedSearchSchemas, settingsSchema, socialSchemas } from "./utils/schemas.js";
import { verifyAccessToken } from "./middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const authService = new AuthService();
const leadService = new LeadService();
const crmService = new CrmService();
const dashboardService = new DashboardService();
const aiAgentService = new AiAgentService();
const billingService = new BillingService();
const adminService = new AdminService();
const nvidiaService = new NvidiaService();
const websiteService = new WebsiteService();
const earnService = new EarnService();
const gigService = new GigService(earnService);
const savedSearchService = new SavedSearchService();
const socialService = new SocialService();

function canUseProAi(user = {}) {
  if (isAdminUser(user)) return true;
  if (user?.entitlements?.unlimitedAccess) return true;
  if (Array.isArray(user?.permissions) && (user.permissions.includes("unlimited") || user.permissions.includes("business_tycoon") || user.permissions.includes("website_builder"))) return true;
  const sub = String(user?.subscription || user?.planName || user?.entitlements?.activePlan || "").toLowerCase();
  if (["professional", "growth_plus", "growth plus", "growth-plus", "agency", "enterprise", "pro"].some((k) => sub.includes(k))) return true;
  if (user?.entitlements?.activePlan && !["trial", "starter", ""].includes(String(user.entitlements.activePlan))) return true;
  return false;
}

function requireProAi(user) {
  if (canUseProAi(user)) return;
  const err = new Error("Business Tycoon AI + Website Studio need a Pro plan or higher. Upgrade on Pricing to unlock.");
  err.status = 402;
  err.code = "PRO_REQUIRED";
  throw err;
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"]
]);

const rateBuckets = new Map();
const signupBuckets = new Map();
const SIGNUP_ABUSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SIGNUP_ABUSE_MAX = 5;

function signupFingerprint(req, body = {}) {
  const ip = clientIp(req);
  const ua = String(getHeader(req, "user-agent") || "").slice(0, 160);
  const lang = String(getHeader(req, "accept-language") || "").slice(0, 80);
  const email = String(body?.email || "").trim().toLowerCase();
  const domain = email.includes("@") ? email.split("@")[1] : "";
  return { ip, deviceKey: `${ua}::${lang}`, domain };
}

async function checkSignupAbuse(req, body = {}) {
  const { ip, deviceKey, domain } = signupFingerprint(req, body);
  const now = Date.now();
  const key = `signup:${ip}:${deviceKey}`;
  let bucket = signupBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, emails: [], resetAt: now + SIGNUP_ABUSE_WINDOW_MS };
  }
  bucket.count += 1;
  const email = String(body?.email || "").trim().toLowerCase();
  if (email && !bucket.emails.includes(email)) bucket.emails.push(email);
  signupBuckets.set(key, bucket);
  if (bucket.count > SIGNUP_ABUSE_MAX && bucket.emails.length > SIGNUP_ABUSE_MAX) {
    try {
      const { FirestoreRepository } = await import("./repositories/firestoreRepository.js");
      const repo = new FirestoreRepository("signupAbuse");
      if (repo) {
        await repo.upsert(`ip:${ip}`, {
          id: `ip:${ip}`,
          ip,
          deviceKey,
          emails: bucket.emails,
          attempts: bucket.count,
          suspendedAt: new Date().toISOString(),
          reason: "signup_abuse_multi_email"
        }).catch(() => {});
      }
    } catch {}
    const err = new AppError("Too many different signup emails from this device. New signups are suspended here — please sign in with one of your existing accounts.", 403, "SIGNUP_SUSPENDED");
    err.details = { suspension: "signup_only", signinAllowed: true };
    throw err;
  }
  return { ip, deviceKey, domain };
}
const publicFiles = new Set([
  "/",
  "/index.html",
  "/login.html",
  "/about.html",
  "/signup.html",
  "/dashboard.html",
  "/crm.html",
  "/lead-details.html",
  "/client-report.html",
  "/pricing.html",
  "/billing-success.html",
  "/profile.html",
  "/settings.html",
  "/admin.html",
  "/reports.html",
  "/analytics.html",
  "/website-studio.html",
  "/website-editor.html",
  "/business-ai.html",
  "/ai-agent.html",
  "/tools.html",
  "/work-planner.html",
  "/share.html",
  "/earn.html",
  "/gigs.html",
  "/learn.html",
  "/academy.html",
  "/outreach.html",
  "/proposals.html",
  "/playbook.html",
  "/money.html",
  "/freelance.html",
  "/digital.html",
  "/content.html",
  "/sales.html",
  "/students.html",
  "/ecommerce.html",
  "/affiliate.html",
  "/coaching.html",
  "/social.html",
  "/community.html",
  "/pay.html",
  "/manifest.webmanifest",
  "/sw.js",
  "/robots.txt",
  "/sitemap.xml",
  "/faq.html",
  "/forgot-password.html",
  "/verify-email.html",
  "/favicon.ico"
]);
const publicFolders = ["/css/", "/js/", "/assets/", "/components/", "/features/"];

function securityHeaders(extra = {}) {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      // Firebase SDK ships from gstatic; browser auth also talks to googleapis.
      "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://www.gstatic.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com",
      "frame-src 'self' https://www.google.com https://maps.google.com https://accounts.google.com https://*.firebaseapp.com",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'"
    ].join("; "),
    // "same-origin" severs window.opener for the Google sign-in popup, which
    // breaks Firebase signInWithPopup — it requires same-origin-allow-popups.
    "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Permitted-Cross-Domain-Policies": "none",
    ...extra
  };
}

function send(res, status, payload, headers = {}) {
  const body = typeof payload === "string" || Buffer.isBuffer(payload)
    ? payload
    : JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Length": Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, payload, { "Content-Type": "application/json; charset=utf-8" });
}

function getHeader(req, name) {
  return req.headers[name.toLowerCase()] || "";
}

function isAllowedOrigin(origin) {
  if (!origin) return !env.isProduction;
  // Development previews (Live Server, JSON Server, Vite, etc.) use random
  // local ports. They are allowed only in development; production remains an
  // explicit allow-list enforced by CORS_ORIGINS / APP_URL.
  if (!env.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/i.test(origin)) return true;
  return env.corsOrigins.includes(origin) || origin === env.appUrl;
}

function applyCors(req, res) {
  const origin = getHeader(req, "origin");
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

function clientIp(req) {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || "unknown";
}

function rateLimit(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + env.rateLimit.windowMs };
  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + env.rateLimit.windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > env.rateLimit.max) throw new AppError("Too many requests.", 429, "RATE_LIMITED");
}

async function readJson(req) {
  if (!["POST", "PATCH", "PUT"].includes(req.method)) return {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new AppError("Request body too large.", 413, "BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("Invalid JSON body.", 400, "INVALID_JSON");
  }
}

function validate(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("Invalid request payload.", 422, "VALIDATION_ERROR", parsed.error.flatten());
  }
  return parsed.data;
}

async function getUser(req) {
  const header = getHeader(req, "authorization");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    throw new AppError("Authentication required.", 401, "AUTH_REQUIRED");
  }
  try {
    const tokenUser = await verifyAccessToken(token);
    // JWT claims are only a session hint. Resolve the account record on every
    // protected operation so an address awaiting verification cannot use an
    // old token, refresh token, or a hand-entered dashboard URL.
    const currentUser = await authService.currentUser(tokenUser);
    authService.assertEmailVerified(currentUser);
    return currentUser;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Invalid or expired token.", 401, "INVALID_TOKEN");
  }
}

async function getAdminUser(req) {
  const user = await getUser(req);
  if (user.role !== "admin") throw new AppError("Insufficient permissions.", 403, "FORBIDDEN");
  return user;
}

function matchRoute(method, pathname, pattern) {
  if (method !== pattern.method) return null;
  const match = pattern.regex.exec(pathname);
  if (!match) return null;
  return Object.fromEntries(pattern.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
}

const routes = [
  {
    method: "GET",
    regex: /^\/api\/config$/,
    keys: [],
    handler: async () => ({
      firebase: {
        apiKey: env.firebase.apiKey || env.firebase.webApiKey || "",
        authDomain: env.firebase.authDomain || "",
        databaseURL: env.firebase.databaseUrl || "",
        projectId: env.firebase.projectId || "",
        storageBucket: env.firebase.storageBucket || "",
        messagingSenderId: env.firebase.messagingSenderId || "",
        appId: env.firebase.appId || "",
        configured: Boolean((env.firebase.apiKey || env.firebase.webApiKey) && env.firebase.projectId)
      }
    })
  },
  {
    method: "GET",
    regex: /^\/api\/health$/,
    keys: [],
    handler: async () => ({
      status: "ok",
      service: "mat-leads-ai-pro-x",
      environment: env.nodeEnv,
      auth: {
        ownerLoginConfigured: Boolean(env.owner.email && env.owner.password),
        userStore: isFirebaseConfigured() ? "firestore" : (process.env.VERCEL ? "ephemeral-memory (register on every cold start; set Firebase vars for persistent users)" : "local-json"),
        jwtConfigured: !String(env.jwtSecret || "").startsWith("development-")
      },
      integrations: {
        firebase: isFirebaseConfigured(),
        googlePlaces: Boolean(env.google.placesApiKey),
        openStreetMap: Boolean(env.osm.overpassEndpoints.length),
        nvidia: Boolean(env.nvidia.apiKey),
        stripe: Boolean(env.stripe.secretKey),
        paypal: Boolean((env.paypal.clientId && env.paypal.clientSecret) || Object.values(env.paypal.paymentLinks).every(Boolean)),
        paypalApi: Boolean(env.paypal.clientId && env.paypal.clientSecret),
        paypalHostedLinks: Object.values(env.paypal.paymentLinks).every(Boolean)
      },
      leadSearch: {
        engineVersion: "strict-coverage-v4",
        interactiveOverpassMirrors: Math.min(2, env.osm.overpassEndpoints.length),
        googlePlacesConfigured: Boolean(env.google.placesApiKey)
      },
      realMode: true,
      aiModels: {
        chat: [env.nvidia.model, ...(env.nvidia.modelFallbacks || [])].filter(Boolean),
        website: [env.nvidia.websiteModel, ...(env.nvidia.websiteFallbacks || []), "z-ai/glm-5.3-flash", "z-ai/glm-5.3"].filter(Boolean),
        tycoon: [env.nvidia.tycoonModel, "z-ai/glm-5.3-flash", "z-ai/glm-5.3"].filter(Boolean)
      },
      missingRequiredForLiveOperation: [
        !env.nvidia.apiKey && "NVIDIA_API_KEY",
        !env.firebase.projectId && "FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY",
        !env.stripe.secretKey && "STRIPE_SECRET_KEY",
        !(env.paypal.clientId && env.paypal.clientSecret) && !Object.values(env.paypal.paymentLinks).every(Boolean) && "PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET or hosted PayPal payment links"
      ].filter(Boolean)
    })
  },
  {
    method: "GET",
    regex: /^\/api\/auth\/debug$/,
    keys: [],
    handler: async () => ({
      ownerEmailSet: Boolean(env.owner.email),
      ownerEmailValue: env.owner.email ? `${String(env.owner.email).slice(0, 3)}***` : "(missing)",
      ownerPasswordSet: Boolean(env.owner.password),
      ownerPasswordLength: String(env.owner.password || "").length,
      jwtConfigured: !String(env.jwtSecret || "").startsWith("development-"),
      userStore: isFirebaseConfigured() ? "firestore" : (process.env.VERCEL ? "ephemeral-memory" : "local-json"),
      hint: "Set OWNER_EMAIL + OWNER_PASSWORD in Vercel env vars (Production + Preview + Development), then redeploy. Values are case-sensitive for the password; email is lowercased."
    })
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/diag$/,
    keys: [],
    handler: async ({ body }) => {
      const steps = {};
      const email = String(body?.email || "").trim().toLowerCase();
      steps.emailReceived = Boolean(email);
      steps.ownerEmailSet = Boolean(env.owner.email);
      steps.ownerEmailMatch = email ? email === env.owner.email : false;
      try {
        steps.ownerCheck = authService.isOwnerLogin(email, String(body?.password || ""));
      } catch (error) {
        steps.ownerCheck = `THREW: ${error.message}`;
      }
      try {
        const found = await authService.users.list({
          where: [{ field: "email", op: "==", value: email || "__none__" }],
          limit: 1
        });
        steps.storeList = `ok, found=${found.length}`;
      } catch (error) {
        steps.storeList = `THREW: ${error.message}`;
      }
      try {
        const { signAccessToken: sign } = await import("./middleware/auth.js");
        sign({ uid: "diag", email: email || "diag@test.local", role: "user" });
        steps.jwtSign = "ok";
      } catch (error) {
        steps.jwtSign = `THREW: ${error.message}`;
      }
      steps.firebaseClient = Boolean(authService.users.client());
      steps.firebaseWebApiKeySet = Boolean(env.firebase?.webApiKey);
      return steps;
    }
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/register$/,
    keys: [],
    handler: async ({ req, body }) => {
      const parsed = validate(authSchemas.register, body);
      await checkSignupAbuse(req, parsed);
      return authService.register(parsed);
    },
    status: 201
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/login$/,
    keys: [],
    handler: async ({ body }) => authService.login(validate(authSchemas.login, body))
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/verify-email$/,
    keys: [],
    handler: async ({ body }) => authService.verifyEmail(validate(authSchemas.verifyEmail, body).token)
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/resend-verification$/,
    keys: [],
    handler: async ({ body }) => authService.resendVerification(validate(authSchemas.resendVerification, body).email)
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/firebase$/,
    keys: [],
    handler: async ({ req, body }) => {
      const { idToken, name, password } = validate(authSchemas.firebaseSession, body);
      const { verifyFirebaseIdToken } = await import("./config/firebase.js");
      const identity = await verifyFirebaseIdToken(idToken);
      return authService.loginWithFirebase(idToken, {
        preVerifiedIdentity: identity,
        profile: { name, password },
        beforeCreate: (emailOrPhone) => checkSignupAbuse(req, { email: emailOrPhone })
      });
    }
  },
  {
    method: "POST",
    regex: /^\/api\/auth\/refresh$/,
    keys: [],
    handler: async ({ body }) => authService.refreshSession(validate(authSchemas.refresh, body).refreshToken)
  },
  {
    method: "GET",
    regex: /^\/api\/auth\/me$/,
    keys: [],
    handler: async ({ req }) => ({ user: await authService.currentUser(await getUser(req)) })
  },
  {
    method: "GET",
    regex: /^\/api\/auth\/profile$/,
    keys: [],
    handler: async ({ req }) => ({ user: await authService.currentUser(await getUser(req)) })
  },
  {
    method: "PATCH",
    regex: /^\/api\/auth\/profile$/,
    keys: [],
    handler: async ({ req, body }) => authService.updateProfile(await getUser(req), validate(profileSchema, body))
  },
  {
    method: "GET",
    regex: /^\/api\/auth\/settings$/,
    keys: [],
    handler: async ({ req }) => {
      const user = await authService.currentUser(await getUser(req));
      return { settings: user.settings, user };
    }
  },
  {
    method: "PATCH",
    regex: /^\/api\/auth\/settings$/,
    keys: [],
    handler: async ({ req, body }) => authService.updateSettings(await getUser(req), validate(settingsSchema, body))
  },
  {
    method: "POST",
    regex: /^\/api\/leads\/search$/,
    keys: [],
    handler: async ({ req, body }) => leadService.search(validate(leadSearchSchema, body), await getUser(req))
  },
  {
    method: "POST",
    regex: /^\/api\/leads\/([^/]+)\/save$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => {
      const user = await getUser(req);
      const lead = await leadService.save(params.id, user, body?.lead);
      if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return { lead };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/leads\/([^/]+)$/,
    keys: ["id"],
    handler: async ({ req, params }) => {
      const lead = await leadService.getForUser(params.id, await getUser(req));
      if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return { lead };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/leads\/([^/]+)\/report$/,
    keys: ["id"],
    handler: async ({ req, params }) => {
      const report = await leadService.getReportForUser(params.id, await getUser(req));
      if (!report) throw new AppError("Lead not found. Search real Google Places data first, then save or open a returned lead.", 404, "LEAD_NOT_FOUND");
      return report;
    }
  },
  {
    method: "GET",
    regex: /^\/api\/ai\/status$/,
    keys: [],
    handler: async () => {
      const status = nvidiaService.status();
      const hint = !status.configured
        ? "Add NVIDIA_API_KEY in .env or Vercel, then restart or redeploy."
        : status.verification === "failed"
          ? status.lastFailure?.message || "NVIDIA AI connection failed."
          : status.verification === "verified"
            ? "AI connection verified."
            : "AI is configured but has not been verified yet.";
      return {
        ...status,
        models: {
          chat: [env.nvidia.model, ...(env.nvidia.modelFallbacks || [])].filter(Boolean).slice(0, 3),
          website: [env.nvidia.websiteModel, ...(env.nvidia.websiteFallbacks || [])].filter(Boolean).slice(0, 3),
          tycoon: [env.nvidia.tycoonModel].filter(Boolean).slice(0, 3)
        },
        hint
      };
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/debug$/,
    keys: [],
    handler: async ({ req, body }) => {
      await getAdminUser(req);
      const prompt = String(body?.prompt || "Say OK in 5 words.").slice(0, 500);
      const started = Date.now();
      try {
        const r = await nvidiaService.chat(prompt);
        return { ok: true, ms: Date.now() - started, provider: r.provider, model: r.model, fallback: Boolean(r.fallback), content: String(r.content || "").slice(0, 1000) };
      } catch (e) {
        return { ok: false, ms: Date.now() - started, error: String(e?.message || e), code: e?.code || null, status: e?.status || null };
      }
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/chat$/,
    keys: [],
    handler: async ({ req, body }) => {
      await getUser(req);
      const payload = validate(aiSchemas.chat, body);
      return nvidiaService.chat(payload.prompt);
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/agent$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      requireProAi(user);
      const payload = validate(aiSchemas.agent, body);
      return aiAgentService.ask(user, payload.prompt);
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/analyze$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      const payload = validate(aiSchemas.analyze, body);
      const lead = await leadService.getForUser(payload.leadId, user);
      if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return nvidiaService.analyzeLead(lead);
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/outreach$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      const payload = validate(aiSchemas.outreach, body);
      const lead = await leadService.getForUser(payload.leadId, user);
      if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return nvidiaService.writeOutreach(lead, payload.type);
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/proposal$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      const payload = validate(aiSchemas.proposal, body);
      const lead = await leadService.getForUser(payload.leadId, user);
      if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return nvidiaService.proposalPack(lead, payload.offerKey || "pro_site");
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/tycoon$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      requireProAi(user);
      const payload = validate(aiSchemas.tycoon, body);
      let lead = payload.lead && Object.keys(payload.lead).length ? payload.lead : null;
      if (!lead && payload.leadId) lead = await leadService.getById(payload.leadId);
      return nvidiaService.tycoonChat(payload.prompt, { lead: lead || {}, user: user.email || "" });
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/websites$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      requireProAi(user);
      const payload = validate(aiSchemas.websiteBuild, body);
      let lead = payload.lead && Object.keys(payload.lead).length ? payload.lead : null;
      if (!lead && payload.leadId) lead = await leadService.getById(payload.leadId);
      if (!lead) lead = { id: payload.leadId || "lead", name: payload.businessName || "Business" };
      const result = await websiteService.build({ lead, options: { businessName: payload.businessName, style: payload.style, palette: payload.palette, pages: payload.pages || 1, images: payload.images || {}, design: payload.design, tone: payload.tone, targetAudience: payload.targetAudience, primaryGoal: payload.primaryGoal, location: payload.location, services: payload.services, cta: payload.cta, about: payload.about, language: payload.language, followBrief: payload.followBrief }, user });
      return { websiteId: result.website.id, shareToken: result.website.shareToken, shareUrl: `/s/${result.website.shareToken}`, studioUrl: `/website-studio.html?id=${encodeURIComponent(result.website.id)}`, website: result.website };
    }
  },
  {
    method: "PATCH",
    regex: /^\/api\/ai\/websites\/([^/]+)$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => {
      const user = await getUser(req);
      requireProAi(user);
      const payload = validate(aiSchemas.websiteRefine, { ...body, websiteId: params.id });
      const result = await websiteService.refine({ id: params.id, instruction: payload.instruction, user });
      return { websiteId: result.website.id, shareToken: result.website.shareToken, shareUrl: `/s/${result.website.shareToken}`, website: result.website };
    }
  },
  {
    method: "POST",
    regex: /^\/api\/ai\/websites\/([^/]+)\/html$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => {
      const user = await getUser(req);
      requireProAi(user);
      const payload = validate(aiSchemas.websiteHtml, body);
      return websiteService.saveHtml(params.id, payload.html, user);
    }
  },
  {
    method: "GET",
    regex: /^\/api\/ai\/websites$/,
    keys: [],
    handler: async ({ req }) => {
      const user = await getUser(req);
      requireProAi(user);
      const websites = await websiteService.listForUser(user);
      return { websites };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/ai\/websites\/([^/]+)$/,
    keys: ["id"],
    handler: async ({ req, params }) => {
      const user = await getUser(req);
      const website = await websiteService.getById(params.id);
      if (!website) throw new AppError("Website not found.", 404, "WEBSITE_NOT_FOUND");
      if (String(website.ownerId || "") !== String(user?.uid || "") && String(user?.role || "").toLowerCase() !== "admin") {
        throw new AppError("You can only open your own websites.", 403, "FORBIDDEN");
      }
      return { website, shareUrl: `/s/${website.shareToken}`, studioUrl: `/website-studio.html?id=${encodeURIComponent(website.id)}` };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/s\/([^/]+)$/,
    keys: ["token"],
    handler: async ({ params }) => {
      const website = await websiteService.getByToken(params.token);
      if (!website) throw new AppError("Shared website not found.", 404, "WEBSITE_NOT_FOUND");
      return { website, html: website.html };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/crm\/leads$/,
    keys: [],
    handler: async ({ req }) => ({ leads: await crmService.listLeads(await getUser(req)) })
  },
  {
    method: "GET",
    regex: /^\/api\/saved-searches$/,
    keys: [],
    handler: async ({ req }) => ({ searches: await savedSearchService.list(await getUser(req)) })
  },
  {
    method: "GET",
    regex: /^\/api\/social\/users$/,
    keys: [],
    handler: async ({ req, url }) => ({ users: await socialService.searchUsers(await getUser(req), validate(socialSchemas.userSearch, { q: url.searchParams.get("q") || "" }).q) })
  },
  {
    method: "GET",
    regex: /^\/api\/social\/profile\/([^/]+)$/,
    keys: ["userId"],
    handler: async ({ req, params }) => ({ profile: await socialService.publicProfile(await getUser(req), params.userId) })
  },
  {
    method: "GET",
    regex: /^\/api\/social\/friends$/,
    keys: [],
    handler: async ({ req }) => ({ friends: await socialService.friends(await getUser(req)) })
  },
  {
    method: "GET",
    regex: /^\/api\/social\/unread$/,
    keys: [],
    handler: async ({ req }) => socialService.unread(await getUser(req))
  },
  {
    method: "GET",
    regex: /^\/api\/social\/notifications$/,
    keys: [],
    handler: async ({ req }) => socialService.listNotifications(await getUser(req))
  },
  {
    method: "POST",
    regex: /^\/api\/social\/notifications\/([^/]+)\/read$/,
    keys: ["id"],
    handler: async ({ req, params }) => ({ notification: await socialService.readNotification(await getUser(req), params.id) })
  },
  {
    method: "POST",
    regex: /^\/api\/social\/notifications\/read-all$/,
    keys: [],
    handler: async ({ req }) => socialService.readAllNotifications(await getUser(req))
  },
  {
    method: "POST",
    regex: /^\/api\/social\/presence$/,
    keys: [],
    handler: async ({ req }) => socialService.touchPresence(await getUser(req))
  },
  {
    method: "GET",
    regex: /^\/api\/social\/blocks$/,
    keys: [],
    handler: async ({ req }) => ({ members: await socialService.listBlocks(await getUser(req)) })
  },
  {
    method: "POST",
    regex: /^\/api\/social\/blocks$/,
    keys: [],
    handler: async ({ req, body }) => ({ block: await socialService.block(await getUser(req), validate(socialSchemas.friendRequest, body).userId) }),
    status: 201
  },
  {
    method: "DELETE",
    regex: /^\/api\/social\/blocks\/([^/]+)$/,
    keys: ["userId"],
    handler: async ({ req, params }) => ({ removed: await socialService.unblock(await getUser(req), params.userId) })
  },
  {
    method: "POST",
    regex: /^\/api\/social\/reports\/([^/]+)$/,
    keys: ["userId"],
    handler: async ({ req, params, body }) => {
      const payload = validate(socialSchemas.report, body);
      return { report: await socialService.report(await getUser(req), params.userId, payload.category, payload.description) };
    },
    status: 201
  },
  {
    method: "GET",
    regex: /^\/api\/social\/requests$/,
    keys: [],
    handler: async ({ req }) => ({ requests: await socialService.requests(await getUser(req)) })
  },
  {
    method: "POST",
    regex: /^\/api\/social\/requests$/,
    keys: [],
    handler: async ({ req, body }) => ({ request: await socialService.request(await getUser(req), validate(socialSchemas.friendRequest, body).userId) }),
    status: 201
  },
  {
    method: "PATCH",
    regex: /^\/api\/social\/requests\/([^/]+)$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => ({ request: await socialService.respond(await getUser(req), params.id, validate(socialSchemas.requestResponse, body).action) })
  },
  {
    method: "DELETE",
    regex: /^\/api\/social\/friends\/([^/]+)$/,
    keys: ["userId"],
    handler: async ({ req, params }) => ({ removed: await socialService.remove(await getUser(req), params.userId) })
  },
  {
    method: "GET",
    regex: /^\/api\/social\/conversations\/([^/]+)\/messages$/,
    keys: ["userId"],
    handler: async ({ req, params }) => ({ messages: await socialService.listMessages(await getUser(req), params.userId) })
  },
  {
    method: "POST",
    regex: /^\/api\/social\/conversations\/([^/]+)\/messages$/,
    keys: ["userId"],
    handler: async ({ req, body, params }) => ({ message: await socialService.sendMessage(await getUser(req), params.userId, validate(socialSchemas.message, body).text) }),
    status: 201
  },
  {
    method: "POST",
    regex: /^\/api\/social\/conversations\/([^/]+)\/messages\/([^/]+)\/reactions$/,
    keys: ["userId", "messageId"],
    handler: async ({ req, body, params }) => ({ message: await socialService.toggleReaction(await getUser(req), params.userId, params.messageId, validate(socialSchemas.reaction, body).emoji) })
  },
  {
    method: "DELETE",
    regex: /^\/api\/social\/conversations\/([^/]+)\/messages\/([^/]+)$/,
    keys: ["userId", "messageId"],
    handler: async ({ req, params }) => ({ message: await socialService.removeMessage(await getUser(req), params.userId, params.messageId) })
  },
  {
    method: "PATCH",
    regex: /^\/api\/social\/conversations\/([^/]+)\/messages\/([^/]+)$/,
    keys: ["userId", "messageId"],
    handler: async ({ req, body, params }) => ({ message: await socialService.editMessage(await getUser(req), params.userId, params.messageId, validate(socialSchemas.messageEdit, body).text) })
  },
  {
    method: "POST",
    regex: /^\/api\/saved-searches$/,
    keys: [],
    handler: async ({ req, body }) => ({ search: await savedSearchService.create(await getUser(req), validate(savedSearchSchemas.create, body)) }),
    status: 201
  },
  {
    method: "POST",
    regex: /^\/api\/saved-searches\/([^/]+)\/run$/,
    keys: ["id"],
    handler: async ({ req, params }) => {
      const search = await savedSearchService.markRun(params.id, await getUser(req));
      if (!search) throw new AppError("Saved search not found.", 404, "SAVED_SEARCH_NOT_FOUND");
      return { search };
    }
  },
  {
    method: "DELETE",
    regex: /^\/api\/saved-searches\/([^/]+)$/,
    keys: ["id"],
    handler: async ({ req, params }) => {
      const removed = await savedSearchService.remove(params.id, await getUser(req));
      if (!removed) throw new AppError("Saved search not found.", 404, "SAVED_SEARCH_NOT_FOUND");
      return { removed: true };
    }
  },
  {
    method: "PATCH",
    regex: /^\/api\/crm\/leads\/([^/]+)\/stage$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => {
      const payload = validate(crmSchemas.stage, body);
      const lead = await crmService.updateStage(params.id, payload.stage, await getUser(req));
      if (!lead) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return { lead };
    }
  },
  {
    method: "POST",
    regex: /^\/api\/crm\/leads\/([^/]+)\/notes$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => {
      const payload = validate(crmSchemas.note, body);
      return { activity: await crmService.addNote(params.id, payload.note, payload.tags, await getUser(req)) };
    },
    status: 201
  },
  {
    method: "POST",
    regex: /^\/api\/crm\/leads\/([^/]+)\/outreach$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => {
      const activity = await crmService.recordOutreach(params.id, validate(crmSchemas.outreachActivity, body), await getUser(req));
      if (!activity) throw new AppError("Lead not found.", 404, "LEAD_NOT_FOUND");
      return { activity };
    },
    status: 201
  },
  {
    method: "GET",
    regex: /^\/api\/dashboard\/metrics$/,
    keys: [],
    handler: async ({ req }) => ({ metrics: await dashboardService.metrics(await getUser(req)) })
  },
  {
    method: "POST",
    regex: /^\/api\/billing\/stripe\/payment-intent$/,
    keys: [],
    handler: async ({ req, body }) => billingService.createStripePaymentIntent(
      validate(billingSchema, body).plan,
      await getUser(req),
      getHeader(req, "idempotency-key")
    )
  },
  {
    method: "POST",
    regex: /^\/api\/billing\/paypal\/order$/,
    keys: [],
    handler: async ({ req, body }) => billingService.createPaypalOrder(validate(billingSchema, body).plan, await getUser(req))
  },
  {
    method: "POST",
    regex: /^\/api\/billing\/paypal\/confirm$/,
    keys: [],
    handler: async ({ req, body }) => billingService.confirmPaypalPayment(validate(paypalConfirmationSchema, body), await getUser(req))
  },
  {
    method: "GET",
    regex: /^\/api\/admin\/overview$/,
    keys: [],
    handler: async ({ req }) => {
      await getAdminUser(req);
      return adminService.overview();
    }
  },
  {
    method: "GET",
    regex: /^\/api\/earn\/offers$/,
    keys: [],
    handler: async ({ req }) => {
      await getUser(req);
      return { offers: earnService.offers() };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/earn\/referral$/,
    keys: [],
    handler: async ({ req }) => {
      const user = await getUser(req);
      const data = await earnService.myReferral(user);
      return { ...data, paidUsd: (data.paidCents / 100).toFixed(2), pendingUsd: (data.pendingCents / 100).toFixed(2) };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/earn\/invoices$/,
    keys: [],
    handler: async ({ req }) => ({ invoices: await earnService.myInvoices(await getUser(req)) })
  },
  {
    method: "POST",
    regex: /^\/api\/earn\/invoices$/,
    keys: [],
    handler: async ({ req, body }) => earnService.createInvoice(await getUser(req), validate(earnSchemas.invoice, body)),
    status: 201
  },
  {
    method: "GET",
    regex: /^\/api\/earn\/invoices\/([^/]+)$/,
    keys: ["id"],
    handler: async ({ params }) => {
      const invoice = await earnService.getInvoice(params.id);
      if (!invoice) throw new AppError("Invoice not found.", 404, "INVOICE_NOT_FOUND");
      return { invoice: earnService.publicInvoice(invoice) };
    }
  },
  {
    method: "POST",
    regex: /^\/api\/earn\/invoices\/([^/]+)\/paid$/,
    keys: ["id"],
    handler: async ({ req, body, params }) => earnService.markInvoicePaid(params.id, await getUser(req), validate(earnSchemas.invoicePaid, body))
  },
  {
    method: "GET",
    regex: /^\/api\/earn\/payouts$/,
    keys: [],
    handler: async ({ req }) => ({ payouts: await earnService.myPayouts(await getUser(req)) })
  },
  {
    method: "POST",
    regex: /^\/api\/earn\/payouts$/,
    keys: [],
    handler: async ({ req, body }) => earnService.requestPayout(await getUser(req), validate(earnSchemas.payout, body)),
    status: 201
  },
  {
    method: "POST",
    regex: /^\/api\/earn\/track-signup$/,
    keys: [],
    handler: async ({ req, body }) => {
      const user = await getUser(req);
      const ref = String(body?.ref || body?.code || "").slice(0, 40);
      if (!ref) return { tracked: false };
      return { tracked: true, referral: await earnService.trackSignup(user, ref) };
    }
  },
  {
    method: "GET",
    regex: /^\/api\/gigs$/,
    keys: [],
    handler: async ({ req }) => ({ gigs: await gigService.list(await getUser(req)) })
  },
  {
    method: "POST",
    regex: /^\/api\/gigs$/,
    keys: [],
    handler: async ({ req, body }) => gigService.create(await getUser(req), validate(gigSchemas.create, body)),
    status: 201
  },
  {
    method: "POST",
    regex: /^\/api\/gigs\/([^/]+)\/claim$/,
    keys: ["id"],
    handler: async ({ req, params }) => gigService.claim(await getUser(req), params.id)
  }
];

async function handleApi(req, res, url) {
  rateLimit(req);
  const body = await readJson(req);
  for (const route of routes) {
    const params = matchRoute(req.method, url.pathname, route);
    if (!params) continue;
    const payload = await route.handler({ req, body, params, url });
    return json(res, route.status || 200, payload);
  }
  throw new AppError(`Route not found: ${req.method} ${url.pathname}`, 404, "NOT_FOUND");
}

async function serveStatic(req, res, url) {
  if (!["GET", "HEAD"].includes(req.method)) {
    throw new AppError("Method not allowed.", 405, "METHOD_NOT_ALLOWED");
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const isPublic = publicFiles.has(url.pathname) || publicFiles.has(requested) || publicFolders.some((folder) => requested.startsWith(folder));
  if (!isPublic || requested.includes("..") || requested.startsWith("/.")) {
    throw new AppError("File not found.", 404, "STATIC_NOT_FOUND");
  }

  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const absolute = path.resolve(projectRoot, `.${safePath}`);
  if (!absolute.startsWith(projectRoot)) throw new AppError("File not allowed.", 403, "STATIC_FORBIDDEN");

  let filePath = absolute;
  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    if (!path.extname(filePath)) filePath = `${filePath}.html`;
  }

  try {
    const body = await fs.readFile(filePath);
    const type = mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream";
    if (req.method === "HEAD") return send(res, 200, "", { "Content-Type": type });
    const cacheControl = type.includes("text/html") || type.includes("javascript") || type.includes("css")
      ? "no-store"
      : "public, max-age=3600";
    return send(res, 200, body, {
      "Content-Type": type,
      "Cache-Control": cacheControl
    });
  } catch {
    const fallback = await fs.readFile(path.join(projectRoot, "index.html"));
    return send(res, 404, fallback, { "Content-Type": "text/html; charset=utf-8" });
  }
}

export async function handleRequest(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return send(res, 204, "");

  try {
    const url = new URL(req.url, env.appUrl);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    if (url.pathname.startsWith("/s/")) {
      const token = decodeURIComponent(url.pathname.slice(3).split("/")[0] || "");
      if (!token) throw new AppError("Shared website not found.", 404, "WEBSITE_NOT_FOUND");
      const website = await websiteService.getByToken(token);
      if (!website?.html) throw new AppError("Shared website not found.", 404, "WEBSITE_NOT_FOUND");
      return send(res, 200, website.html, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        // Public client websites may use their generated inline CSS, but only
        // the first-party page-navigation runtime may execute.
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self' https:; frame-ancestors 'self'"
      });
    }
    return await serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    const errorCode = String(error.code || "");
    const showMessage = status < 500 || errorCode.endsWith("_NOT_CONFIGURED") || errorCode.startsWith("NVIDIA_") || errorCode === "AUTH_STORE_UNAVAILABLE" || errorCode === "AUTH_UPSTREAM_UNAVAILABLE";
    if (status >= 500) {
      try {
        const { logger } = await import("./utils/logger.js");
        logger.error("request_failed", { path: req.url, method: req.method, code: error.code, message: error.message, stack: String(error.stack || "").slice(0, 800) });
      } catch {}
    }
    return json(res, status, {
      error: {
        code: error.code || "INTERNAL_SERVER_ERROR",
        message: showMessage ? error.message : "Something went wrong. Please retry; if it persists check Vercel env vars + logs.",
        details: error.details
      }
    });
  }
}

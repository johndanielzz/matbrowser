import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  if (process.env.VERCEL) return;
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

function list(value, fallback = []) {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: number(process.env.PORT, 3000),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  corsOrigins: list(process.env.CORS_ORIGINS, ["http://localhost:3000"]),
  jwtSecret: process.env.JWT_SECRET || "development-jwt-secret-replace-before-production",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "development-refresh-secret-replace-before-production",
  google: {
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || ""
  },
  osm: {
    overpassEndpoints: list(process.env.OVERPASS_ENDPOINTS, [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
      "https://api.openstreetmap.fr/oapi/interpreter"
    ])
  },
  firebase: {
    // Client SDK values (safe to expose to the browser - restricted in Firebase Console).
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyA0nRrFw0WGjwfrJb-mnzFreR62hw8iLNw",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "mat-lead-c0ca4.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "mat-lead-c0ca4",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "mat-lead-c0ca4.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "826518752424",
    appId: process.env.FIREBASE_APP_ID || "1:826518752424:web:dbb47dd6ea98a028a6069d",
    databaseUrl: process.env.FIREBASE_DATABASE_URL || "https://mat-lead-c0ca4-default-rtdb.firebaseio.com",
    // Admin SDK values (SECRET - server only).
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    webApiKey: process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY || "AIzaSyA0nRrFw0WGjwfrJb-mnzFreR62hw8iLNw"
  },
  nvidia: {
    apiKey: process.env.NVIDIA_API_KEY || "",
    baseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    // Live probe (Oct 2026): openai/gpt-oss-20b answered in ~2.6s and is healthy.
    // kimi-k3 is 410 Gone (EOL 2026-10-15); the z-ai glm models ran ~44s under
    // load, so they are fallbacks only. gpt-oss-20b is the fast, reliable primary.
    model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    modelFallbacks: list(process.env.NVIDIA_MODEL_FALLBACKS, ["openai/gpt-oss-20b", "z-ai/glm-5.3-flash"]),
    websiteModel: process.env.NVIDIA_WEBSITE_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    websiteFallbacks: list(process.env.NVIDIA_WEBSITE_FALLBACKS, ["openai/gpt-oss-20b", "z-ai/glm-5.3-flash"]),
    tycoonModel: process.env.NVIDIA_TYCOON_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    // Interactive budget: gpt-oss-20b normally answers in 5-11s, but under load a
    // single attempt can spike past the 17s per-attempt cap. 30s lets attempt 1
    // run its full cap and still gives a primary retry real room before giving up.
    // NVIDIA reasoning models can legitimately take 20–35 seconds during
    // provider load. Keep a bounded interactive window, but do not abort the
    // primary model before it has a chance to finish.
    timeoutMs: Math.max(45000, number(process.env.NVIDIA_TIMEOUT_MS, 45000)),
    websiteTimeoutMs: Math.max(60000, number(process.env.NVIDIA_WEBSITE_TIMEOUT_MS, 60000)),
    cacheTtlMs: number(process.env.NVIDIA_CACHE_TTL_MS, 600000),
    maxTokens: number(process.env.NVIDIA_MAX_TOKENS, 420)
  },
  pollinations: {
    apiKey: process.env.POLLINATIONS_API_KEY || "",
    baseUrl: process.env.POLLINATIONS_BASE_URL || "https://gen.pollinations.ai",
    // Classic text endpoint (text.pollinations.ai/openai). The Gen endpoint is
    // allow-list gated: a key whose permissions.models is empty is refused for
    // EVERY model, so Classic is the only path that can actually answer.
    classicBaseUrl: process.env.POLLINATIONS_CLASSIC_BASE_URL || "https://text.pollinations.ai",
    classicModel: process.env.POLLINATIONS_CLASSIC_MODEL || "openai-fast",
    // Classic free tier: 1 reply per 30s per IP (HTTP 402 FREE_LIMIT).
    classicMinIntervalMs: number(process.env.POLLINATIONS_CLASSIC_MIN_INTERVAL_MS, 31000),
    classicTimeoutMs: number(process.env.POLLINATIONS_CLASSIC_TIMEOUT_MS, 150000)
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ""
  },
  paypal: {
    env: process.env.PAYPAL_ENV || "sandbox",
    clientId: process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
    paymentLinks: {
      starter: process.env.PAYPAL_STARTER_PAYMENT_LINK || "https://www.paypal.com/ncp/payment/39W6KNEUB23KN",
      professional: process.env.PAYPAL_PROFESSIONAL_PAYMENT_LINK || "https://www.paypal.com/ncp/payment/9EVHZMVYV7A52",
      growthPlus: process.env.PAYPAL_GROWTH_PLUS_PAYMENT_LINK || "https://www.paypal.com/ncp/payment/YVE74UL365V8W",
      agency: process.env.PAYPAL_AGENCY_PAYMENT_LINK || "https://www.paypal.com/ncp/payment/SY3RYMGDZ9A7E"
    }
  },
  email: {
    // Verification mail is delivered through the Resend or SendGrid HTTPS APIs
    // (no npm packages). Without a key the flow still runs: the verification
    // link is returned to the client instead of being mailed.
    resendApiKey: process.env.RESEND_API_KEY || "",
    sendgridApiKey: process.env.SENDGRID_API_KEY || "",
    from: process.env.EMAIL_FROM || "",
    // EMAIL_VERIFICATION=off lets signups skip the verify step (tests/dev).
    verificationRequired: String(process.env.EMAIL_VERIFICATION || (process.env.NODE_ENV === "production" ? "required" : "off")).toLowerCase() !== "off"
  },
  rateLimit: {
    windowMs: number(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    max: number(process.env.RATE_LIMIT_MAX, 120)
  },
  owner: {
    email: String(process.env.OWNER_EMAIL || "owner@matleads.local").trim().toLowerCase(),
    password: String(process.env.OWNER_PASSWORD || "admin2026").trim(),
    passwordFallbacks: ["admin2026", "freeusers2026"]
  }
};

export function assertProductionSecrets() {
  if (!env.isProduction) return;

  const missing = [
    ["JWT_SECRET", env.jwtSecret],
    ["JWT_REFRESH_SECRET", env.jwtRefreshSecret],
    ["GOOGLE_PLACES_API_KEY", env.google.placesApiKey],
    ["NVIDIA_API_KEY", env.nvidia.apiKey],
    ["POLLINATIONS_API_KEY", env.pollinations.apiKey],
    ["FIREBASE_PROJECT_ID", env.firebase.projectId],
    ["FIREBASE_CLIENT_EMAIL", env.firebase.clientEmail],
    ["FIREBASE_PRIVATE_KEY", env.firebase.privateKey]
  ].filter(([, value]) => !value || value.startsWith("development-"));

  if (missing.length) {
    throw new Error(`Missing production secrets: ${missing.map(([name]) => name).join(", ")}`);
  }
}

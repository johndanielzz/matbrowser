import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { applyAdminEntitlements } from "../utils/entitlements.js";

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function parseDuration(duration) {
  const match = /^(\d+)([mhd])$/.exec(duration);
  if (!match) return 1800;
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "m") return value * 60;
  if (unit === "h") return value * 60 * 60;
  return value * 24 * 60 * 60;
}

function signJwt(payload, secret, expiresIn) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const claims = {
    ...payload,
    iss: "mat-leads-ai-pro-x",
    aud: "mat-leads-users",
    iat: now,
    exp: now + parseDuration(expiresIn)
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

function verifyJwt(token, secret) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) throw new Error("Malformed token");
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid signature");
  }

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== "mat-leads-ai-pro-x" || claims.aud !== "mat-leads-users") throw new Error("Invalid claims");
  if (claims.exp && claims.exp < now) throw new Error("Expired token");
  return claims;
}

export function signAccessToken(user) {
  const entitled = applyAdminEntitlements(user);
  return signJwt({
    uid: entitled.uid,
    email: entitled.email,
    role: entitled.role || "user",
    subscription: entitled.subscription || "trial",
    planName: entitled.planName || "",
    billingStatus: entitled.billingStatus || "trial",
    monthlyLeadLimit: entitled.monthlyLeadLimit ?? null,
    trialSearchesUsed: entitled.trialSearchesUsed || entitled.entitlements?.trialSearchesUsed || 0,
    trialSearchLimit: entitled.trialSearchLimit || entitled.entitlements?.trialSearchLimit || null,
    trialLeadLimit: entitled.trialLeadLimit || entitled.entitlements?.trialLeadLimit || null,
    permissions: entitled.permissions || [],
    entitlements: entitled.entitlements || {}
  }, env.jwtSecret, "30m");
}

export function signRefreshToken(user) {
  return signJwt({
    uid: user.uid,
    email: user.email,
    role: user.role || "user",
    tokenVersion: user.tokenVersion || 1
  }, env.jwtRefreshSecret, "30d");
}

export async function verifyAccessToken(token) {
  const decoded = verifyJwt(token, env.jwtSecret);

  return applyAdminEntitlements({
    uid: decoded.uid,
    email: decoded.email,
    role: decoded.role || "user",
    subscription: decoded.subscription || "trial",
    planName: decoded.planName || "",
    billingStatus: decoded.billingStatus || "trial",
    monthlyLeadLimit: decoded.monthlyLeadLimit ?? undefined,
    trialSearchesUsed: decoded.trialSearchesUsed || 0,
    trialSearchLimit: decoded.trialSearchLimit || undefined,
    trialLeadLimit: decoded.trialLeadLimit || undefined,
    permissions: decoded.permissions || [],
    entitlements: decoded.entitlements || {},
    provider: "jwt"
  });
}

export async function verifyRefreshToken(token) {
  const decoded = verifyJwt(token, env.jwtRefreshSecret);
  if (!decoded.uid) throw new Error("Missing subject");
  return {
    uid: decoded.uid,
    email: decoded.email || "",
    role: decoded.role || "user",
    tokenVersion: decoded.tokenVersion || 1,
    provider: "refresh_jwt"
  };
}

export async function requireUser(req, _res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return next(new AppError("Authentication required.", 401, "AUTH_REQUIRED"));
  }

  try {
    req.user = await verifyAccessToken(token);
    next();
  } catch {
    next(new AppError("Invalid or expired token.", 401, "INVALID_TOKEN"));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Insufficient permissions.", 403, "FORBIDDEN"));
    }
    next();
  };
}

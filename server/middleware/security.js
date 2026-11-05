import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

function isAllowedOrigin(origin) {
  if (!origin) return !env.isProduction;
  if (env.corsOrigins.includes(origin)) return true;
  return origin === env.appUrl;
}

function csrfGuard(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (isAllowedOrigin(origin)) return next();
  next(new AppError("Invalid request origin.", 403, "CSRF_ORIGIN_BLOCKED"));
}

function securityHeaders(_req, res, next) {
  res.setHeader("Content-Security-Policy", [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://www.gstatic.com https://www.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com",
    "frame-src 'self' https://www.google.com https://maps.google.com https://accounts.google.com https://*.firebaseapp.com",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; "));
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Download-Options", "noopen");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  next();
}

function rateLimiter() {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const bucket = buckets.get(ip) || { count: 0, resetAt: now + env.rateLimit.windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + env.rateLimit.windowMs;
    }

    bucket.count += 1;
    buckets.set(ip, bucket);
    res.setHeader("RateLimit-Limit", String(env.rateLimit.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(env.rateLimit.max - bucket.count, 0)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > env.rateLimit.max) {
      return next(new AppError("Too many requests.", 429, "RATE_LIMITED"));
    }

    next();
  };
}

export function applySecurity(app) {
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(compression());
  app.use(securityHeaders);
  app.use(cors({
    origin(origin, callback) {
      callback(isAllowedOrigin(origin) ? null : new Error("CORS origin blocked"), true);
    },
    credentials: true
  }));
  app.use(rateLimiter());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());
  app.use(csrfGuard);
}

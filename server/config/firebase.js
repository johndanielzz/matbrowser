import crypto from "node:crypto";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

// A malformed FIREBASE_PRIVATE_KEY paste (missing \n escaping, stray quotes,
// or a truncated/placeholder key) used to make every Firestore call throw
// mid-request. Validate the key shape up front and treat bad credentials as
// "not configured" so the app falls back to the local store instead of
// failing every request with ERR_OSSL_UNSUPPORTED.
function hasFirestoreCredentials() {
  const key = normalizedPrivateKey(env.firebase.privateKey);
  if (!env.firebase.projectId || !env.firebase.clientEmail || !key) return false;
  try {
    crypto.createPrivateKey(key);
    return true;
  } catch {
    return false;
  }
}

let cachedToken = null;

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function encodeJwt(payload, privateKey) {
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  signer.end();
  const signature = signer.sign(privateKey || env.firebase.privateKey, "base64url");
  return `${header}.${body}.${signature}`;
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  const privateKey = normalizedPrivateKey(env.firebase.privateKey);
  if (!privateKey || !env.firebase.clientEmail || !env.firebase.projectId) {
    throw new Error("Firestore credentials incomplete");
  }
  const assertion = encodeJwt({
    iss: env.firebase.clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }, privateKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("firestore_oauth_failed", { status: response.status, body: body.slice(0, 300) });
    throw new Error("Firestore OAuth failed");
  }

  const payload = await response.json();
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + Number(payload.expires_in || 3600)
  };
  return cachedToken.value;
}

function documentUrl(collection, id = "") {
  const escapedCollection = encodeURIComponent(collection);
  const escapedId = id ? `/${encodeURIComponent(id)}` : "";
  return `https://firestore.googleapis.com/v1/projects/${env.firebase.projectId}/databases/(default)/documents/${escapedCollection}${escapedId}`;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeValue) } };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]))
      }
    };
  }
  return { stringValue: String(value) };
}

function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeValue(item)]));
  }
  return null;
}

function encodeDocument(data) {
  return {
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]))
  };
}

function decodeDocument(doc) {
  const id = doc.name?.split("/").pop();
  const data = Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, decodeValue(value)]));
  return { id, ...data };
}

export function isFirebaseConfigured() {
  return hasFirestoreCredentials();
}

function normalizedPrivateKey(raw = "") {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  // Vercel env editors often store literal \n - convert to real newlines, then normalize wrapping quotes.
  let key = trimmed.replace(/\\n/g, "\n");
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.includes("BEGIN PRIVATE KEY") ? key : "";
}

export function isFirebaseAuthConfigured() {
  return Boolean(env.firebase.webApiKey);
}

export async function verifyFirebaseIdToken(idToken) {
  if (!env.firebase.webApiKey) {
    const { AppError } = await import("../utils/errors.js");
    throw new AppError("Google sign-in is unavailable right now. Please sign in with your email and password instead.", 503, "GOOGLE_SIGNIN_NOT_CONFIGURED");
  }
  let response;
  try {
    response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.firebase.webApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
  } catch {
    throw new AppError("Login service is temporarily unavailable. Please try again.", 503, "AUTH_UPSTREAM_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new AppError("That Google sign-in token is invalid or expired. Please try again.", 401, "INVALID_FIREBASE_TOKEN");
  }
  const payload = await response.json();
  const record = payload?.users?.[0];
  if (!record?.localId) {
    throw new AppError("That Google sign-in token is invalid or expired. Please try again.", 401, "INVALID_FIREBASE_TOKEN");
  }
  const provider = Array.isArray(record.providerUserInfo) && record.providerUserInfo.length
    ? String(record.providerUserInfo[0].providerId || "password")
    : (record.phoneNumber && !record.email ? "phone" : "password");
  return {
    uid: String(record.localId),
    email: String(record.email || "").trim().toLowerCase(),
    emailVerified: Boolean(record.emailVerified),
    phoneNumber: String(record.phoneNumber || ""),
    displayName: String(record.displayName || ""),
    provider
  };
}

export function firestoreClient() {
  if (!hasFirestoreCredentials()) return null;

  return {
    async get(collection, id) {
      const token = await getAccessToken();
      const response = await fetch(documentUrl(collection, id), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Firestore get failed with ${response.status}`);
      return decodeDocument(await response.json());
    },

    async set(collection, id, data) {
      const token = await getAccessToken();
      const response = await fetch(documentUrl(collection, id), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(encodeDocument(data))
      });
      if (!response.ok) throw new Error(`Firestore set failed with ${response.status}`);
      return decodeDocument(await response.json());
    },

    async list(collection, { limit = 50 } = {}) {
      const token = await getAccessToken();
      const url = new URL(documentUrl(collection));
      url.searchParams.set("pageSize", String(limit));
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`Firestore list failed with ${response.status}`);
      const payload = await response.json();
      return (payload.documents || []).map(decodeDocument);
    }
  };
}

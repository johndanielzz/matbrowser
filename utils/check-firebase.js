import cryptoModule from "node:crypto";
import { env } from "../api/config/env.js";

const lines = [];
const log = (...parts) => lines.push(parts.join(" "));
const pass = (label) => log(`PASS  ${label}`);
const fail = (label, detail) => log(`FAIL  ${label}${detail ? ` -> ${detail}` : ""}`);
const info = (label, detail) => log(`INFO  ${label}${detail ? ` -> ${detail}` : ""}`);

log(`nodeEnvironment: ${env.nodeEnv} (${env.isProduction ? "production" : "non-production"})`);
log(`projectId:        ${env.firebase.projectId || "(missing)"}`);
log(`clientEmail:      ${env.firebase.clientEmail || "(missing)"}`);
log(`privateKey:       ${env.firebase.privateKey ? `detected (${env.firebase.privateKey.length} chars, starts "${env.firebase.privateKey.slice(0, 28)}...")` : "(missing)"}`);
log(`webApiKey:        ${env.firebase.webApiKey ? "detected" : "(missing)"}`);
log("");

let failed = false;

if (env.firebase.webApiKey) {
  try {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.firebase.webApiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "firebase-check-no-such-user@example.com", password: "Password123", returnSecureToken: true })
    });
    const payload = await response.json().catch(() => ({}));
    const reason = payload?.error?.message || "";
    if (reason.includes("INVALID_LOGIN_CREDENTIALS") || reason.includes("EMAIL_NOT_FOUND")) {
      pass("FIREBASE_WEB_API_KEY is valid and Identity Toolkit is reachable");
    } else {
      failed = true;
      fail("FIREBASE_WEB_API_KEY", `${response.status} ${reason || "unexpected response"}`);
    }
  } catch (error) {
    failed = true;
    fail("FIREBASE_WEB_API_KEY", error.message);
  }
} else {
  failed = true;
  fail("FIREBASE_WEB_API_KEY", "missing - register and login will return 503 FIREBASE_AUTH_NOT_CONFIGURED");
}

if (env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const base64Url = (input) => Buffer.from(input).toString("base64url");
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64Url(JSON.stringify({
      iss: env.firebase.clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    }));
    const signer = cryptoModule.createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    signer.end();
    const assertion = `${header}.${claims}.${signer.sign(env.firebase.privateKey, "base64url")}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      failed = true;
      fail("service account OAuth", `${tokenResponse.status} ${tokenPayload.error_description || tokenPayload.error || "token request failed"}`);
    } else {
      pass("service account OAuth token issued (private key and client email are valid)");
      const readResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${env.firebase.projectId}/databases/(default)/documents/users?pageSize=1`, {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
      });
      if (readResponse.ok) {
        pass(`Firestore reachable on project ${env.firebase.projectId} (users collection readable)`);
      } else {
        failed = true;
        const body = await readResponse.text().catch(() => "");
        let detail = `${readResponse.status} ${body.slice(0, 200)}`;
        try {
          const parsed = JSON.parse(body);
          detail = `${readResponse.status} ${parsed.error?.message || detail}`;
        } catch {
          // Keep the raw body when Firestore does not return JSON.
        }
        fail("Firestore read", detail);
      }
    }
  } catch (error) {
    failed = true;
    fail("service account", error.message);
  }
} else {
  failed = true;
  fail("FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY", "missing - account, lead and CRM writes will return 503 STORAGE_NOT_CONFIGURED");
}

log("");
log(failed ? "RESULT: some Firebase settings are still incomplete (see FAIL lines above)." : "RESULT: Firebase authentication and Firestore storage are both ready.");

console.log(lines.join("\n"));

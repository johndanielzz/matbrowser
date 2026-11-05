import { env } from "../config/env.js";

// Zero-dependency transactional mail: verification links go out through the
// Resend or SendGrid HTTPS APIs with plain fetch (package.json stays empty).
// With no key configured the signup flow still works — the caller receives
// the verification URL so it can be shown to the user instead of mailed.
const TIMEOUT_MS = 8000;

function provider() {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SENDGRID_API_KEY) return "sendgrid";
  return "";
}

export function mailProviderConfigured() {
  return Boolean(provider());
}

export function verificationLink(token) {
  const base = String(env.appUrl || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/verify-email.html?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainText(name, url) {
  return [
    `Hi ${name || "there"},`,
    "",
    "Confirm your email address to activate your MAT LEADS AI PRO X account.",
    "",
    "Open this link to verify:",
    url,
    "",
    "The link expires in 24 hours. If you did not create this account, you can ignore this message.",
    "",
    "— MAT LEADS AI PRO X"
  ].join("\n");
}

function htmlMail(name, url) {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fa;padding:32px 16px;color:#101828">',
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:14px;padding:28px">',
    '<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#b3543f;font-weight:700;margin:0 0 14px">MAT LEADS AI PRO X</p>',
    `<h1 style="font-size:20px;margin:0 0 10px">Verify your email address</h1>`,
    `<p style="font-size:14px;line-height:1.6;margin:0 0 18px">Hi ${escapeHtml(name || "there")}, confirm your email to activate your workspace and start your free trial.</p>`,
    `<p style="margin:0 0 18px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0b6bcb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Verify my email</a></p>`,
    `<p style="font-size:12px;color:#667085;line-height:1.6;margin:0 0 6px">Or paste this link into your browser:</p>`,
    `<p style="font-size:12px;word-break:break-all;margin:0 0 18px"><a href="${escapeHtml(url)}" style="color:#0b6bcb">${escapeHtml(url)}</a></p>`,
    '<p style="font-size:12px;color:#667085;margin:0">The link expires in 24 hours. If you did not create this account, you can ignore this message.</p>',
    "</div></div>"
  ].join("");
}

export async function sendVerificationMail({ to, name = "", token = "" }) {
  const url = verificationLink(token);
  const kind = provider();
  if (!kind || !to || !token) return { delivered: false, url, error: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  if (!env.email.from) return { delivered: false, url, error: "EMAIL_FROM_NOT_CONFIGURED" };
  const subject = "Verify your email — MAT LEADS AI PRO X";

  try {
    if (kind === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.email.from,
          to: [to],
          subject,
          text: plainText(name, url),
          html: htmlMail(name, url)
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { delivered: false, url, error: `resend:${res.status}` };
      return { delivered: true, url };
    }

    if (kind === "sendgrid") {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: env.email.from, name: "MAT LEADS AI PRO X" },
          subject,
          content: [
            { type: "text/plain", value: plainText(name, url) },
            { type: "text/html", value: htmlMail(name, url) }
          ]
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) return { delivered: false, url, error: `sendgrid:${res.status}` };
      return { delivered: true, url };
    }
  } catch (error) {
    return { delivered: false, url, error: String(error?.message || error) };
  }

  return { delivered: false, url };
}

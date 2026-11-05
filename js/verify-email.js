import { apiFetch, byId } from "./api.js";

const PENDING_KEY = "mat_pending_verification";

function show(state) {
  ["verifyWorking", "verifySent", "verifySuccess", "verifyError"].forEach((id) => {
    const node = byId(id);
    if (node) node.hidden = id !== state;
  });
}

function readPending() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    if (parsed && parsed.at && Date.now() - parsed.at < 48 * 60 * 60 * 1000) return parsed;
  } catch {}
  return null;
}

function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
}

function statusLine(id, message) {
  const node = byId(id);
  if (!node) return;
  node.hidden = false;
  node.textContent = message;
}

async function runVerification(token) {
  show("verifyWorking");
  try {
    const result = await apiFetch("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    if (result.verified) {
      clearPending();
      const line = byId("verifySuccessLine");
      if (line && result.email) line.textContent = `${result.email} is verified. Taking you to the login page…`;
      show("verifySuccess");
      setTimeout(() => { window.location.href = "/login.html?verified=1"; }, 2200);
      return true;
    }
  } catch (error) {
    const line = byId("verifyErrorLine");
    if (line) line.textContent = error.message || "We could not verify that link.";
    const pending = readPending();
    const field = byId("errorResendEmail");
    if (field) field.value = pending?.email || new URLSearchParams(window.location.search).get("email") || "";
    show("verifyError");
    return false;
  }
  return false;
}

function bindResendForm(formId, statusId, emailFallback) {
  const form = byId(formId);
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(form.querySelector("input")?.value || "").trim();
    if (!email) return;
    statusLine(statusId, "Sending a fresh verification link…");
    try {
      const result = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({
          email,
          sent: Boolean(result.verificationSent),
          at: Date.now()
        }));
      } catch {}
      statusLine(statusId, result.message || "If that address is waiting for verification, a fresh link is on its way.");
      refreshPendingButton(email);
    } catch (error) {
      statusLine(statusId, error.message);
    }
  });
}

function refreshPendingButton(email) {
  const button = byId("openPendingLink");
  if (!button) return;
  const pending = readPending();
  button.hidden = true;
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const email = params.get("email") || "";
  const deliverySent = params.get("sent") !== "0";
  const pending = readPending();

  const firebaseCode = params.get("oobCode") || "";
  if (firebaseCode) {
    show("verifyWorking");
    import("./firebase-auth.js")
      .then(({ applyEmailVerificationCode }) => applyEmailVerificationCode(firebaseCode))
      .then(() => {
        clearPending();
        const line = byId("verifySuccessLine");
        if (line) line.textContent = "Your email is verified. Taking you to the sign-in page...";
        show("verifySuccess");
        setTimeout(() => { window.location.href = "/login.html?verified=1"; }, 1800);
      })
      .catch((error) => {
        const line = byId("verifyErrorLine");
        if (line) line.textContent = error.message || "We could not verify that link.";
        show("verifyError");
      });
    return;
  }

  bindResendForm("resendForm", "resendStatus", email);
  bindResendForm("errorResendForm", "errorResendStatus", email);

  const openPending = byId("openPendingLink");
  openPending?.setAttribute("hidden", "");

  if (token) {
    runVerification(token);
    return;
  }

  // No token in the URL — show the "check your inbox" state.
  const target = email || pending?.email || "";
  const sentLine = byId("verifySentLine");
  if (sentLine && target) sentLine.textContent = deliverySent
    ? `We sent a verification link to ${target}.`
    : `We could not send a verification link to ${target} yet. Configure transactional email, then use Resend below.`;
  const resendField = byId("resendEmail");
  if (resendField && target) resendField.value = target;
  const errorField = byId("errorResendEmail");
  if (errorField && target) errorField.value = target;
  refreshPendingButton(target);
  show("verifySent");

  if (params.get("resend") === "1" && target) {
    // Arrived from a blocked login — trigger the resend immediately.
    byId("resendForm")?.requestSubmit();
  }
});

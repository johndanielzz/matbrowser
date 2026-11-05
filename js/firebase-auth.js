import { apiFetch, setSession } from "./api.js";

const FALLBACK_CONFIG = {
  apiKey: "AIzaSyA0nRrFw0WGjwfrJb-mnzFreR62hw8iLNw",
  authDomain: "mat-lead-c0ca4.firebaseapp.com",
  databaseURL: "https://mat-lead-c0ca4-default-rtdb.firebaseio.com",
  projectId: "mat-lead-c0ca4",
  storageBucket: "mat-lead-c0ca4.firebasestorage.app",
  messagingSenderId: "826518752424",
  appId: "1:826518752424:web:dbb47dd6ea98a028a6069d"
};

let firebaseConfig = { ...FALLBACK_CONFIG };
try {
  const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
  if (res.ok) {
    const data = await res.json();
    if (data?.firebase?.configured) firebaseConfig = { ...firebaseConfig, ...data.firebase };
  }
} catch {}

const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
const {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  signOut,
  applyActionCode,
  onAuthStateChanged
} = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.useDeviceLanguage();

export async function sessionWithBackend(firebaseUser, extra = {}) {
  const idToken = await firebaseUser.getIdToken(true);
  const result = await apiFetch("/api/auth/firebase", { method: "POST", body: JSON.stringify({ idToken, ...extra }) });
  setSession(result);
  return result;
}

export async function signInWithGoogle(status) {
  try {
    if (status) status.textContent = "Opening Google sign-in...";
    const credential = await signInWithPopup(auth, new GoogleAuthProvider());
    if (status) status.textContent = "Verifying with MAT LEADS...";
    const result = await sessionWithBackend(credential.user);
    if (status) status.textContent = "Success. Redirecting...";
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") ? next : "/dashboard.html";
    return result;
  } catch (error) {
    if (status) status.textContent = friendlyAuthError(error);
    throw error;
  }
}

export async function registerWithEmail(name, email, password, status) {
  try {
    if (status) status.textContent = "Creating your workspace...";
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(credential.user, { url: `${window.location.origin}/verify-email.html`, handleCodeInApp: true });
    try { localStorage.setItem("mat_pending_verification", JSON.stringify({ email, at: Date.now() })); } catch {}
    await signOut(auth);
    if (status) status.textContent = "Verification email sent. Check your inbox to activate your workspace...";
    window.location.href = `/verify-email.html?email=${encodeURIComponent(email)}`;
  } catch (error) {
    if (status) status.textContent = friendlyAuthError(error);
    throw error;
  }
}

export async function signInWithEmail(email, password, status) {
  try {
    if (status) status.textContent = "Signing you in...";
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await credential.user.reload();
    if (!credential.user.emailVerified) {
      await signOut(auth);
      const error = new Error("Your email address hasn't been verified yet. Check your inbox, then try again.");
      error.code = "ACCOUNT_NOT_VERIFIED";
      throw error;
    }
    if (status) status.textContent = "Verifying your workspace...";
    const result = await sessionWithBackend(credential.user);
    if (status) status.textContent = "Success. Redirecting...";
    const next = new URLSearchParams(window.location.search).get("next");
    window.location.href = next && next.startsWith("/") ? next : "/dashboard.html";
    return result;
  } catch (error) {
    try {
      const result = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setSession(result);
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") ? next : "/dashboard.html";
      return result;
    } catch {}
    if (status) status.textContent = friendlyAuthError(error);
    throw error;
  }
}

export async function applyEmailVerificationCode(code, status) {
  if (!code) throw new Error("Verification link is missing or invalid.");
  try {
    if (status) status.textContent = "Confirming your email...";
    await applyActionCode(auth, code);
    try { localStorage.removeItem("mat_pending_verification"); } catch {}
  } catch (error) {
    if (status) status.textContent = friendlyAuthError(error);
    throw error;
  }
}

export async function sendVerificationEmail(status) {
  const user = auth.currentUser;
  if (!user) throw new Error("Log in first, then request a verification email.");
  await sendEmailVerification(user, { url: `${window.location.origin}/verify-email.html`, handleCodeInApp: true });
  if (status) status.textContent = "Verification email sent. Check your inbox and spam folder.";
}

export async function sendPasswordReset(email, status) {
  try {
    if (status) status.textContent = "Sending reset email...";
    await sendPasswordResetEmail(auth, email);
    if (status) status.textContent = "Password reset email sent. Check your inbox and spam folder.";
  } catch (error) {
    if (status) status.textContent = friendlyAuthError(error);
    throw error;
  }
}

export function watchVerificationBanner() {
  const banner = document.querySelector("[data-verify-banner]");
  if (!banner) return;
  onAuthStateChanged(auth, async (user) => {
    if (!user || user.emailVerified || !user.email) { banner.hidden = true; return; }
    banner.hidden = false;
  });
}

function friendlyAuthError(error) {
  const code = String(error?.code || "").replace(/^auth\//, "");
  if (code === "ACCOUNT_NOT_VERIFIED") return error.message;
  if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) return "Google sign-in was closed before finishing. Try again.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a few minutes and try again.";
  if (code.includes("email-already-in-use")) return "An account with this email already exists. Try logging in instead.";
  if (code.includes("weak-password")) return "Password is too weak. Use at least 8 characters.";
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) return "Invalid email or password.";
  if (code.includes("operation-not-allowed")) return "Email and password sign-in is temporarily unavailable. Please try again in a moment.";
  if (code.includes("unauthorized-domain")) return "Sign-in from this site is not enabled yet. Please contact support.";
  const raw = String(error?.message || "");
  if (!raw || /firebase|auth\/[a-z-]+/i.test(raw)) return "Something went wrong. Please try again.";
  return raw;
}

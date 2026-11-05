import { apiFetch, byId, isProUser, requireAuth } from "./api.js";

let lastAnswer = "";
let busy = false;
let emptyTemplate = "";

const thread = () => byId("tycoonThread");

function scrollThread() {
  const t = thread();
  if (t) t.scrollTop = t.scrollHeight;
}

function addUserMsg(text) {
  const el = document.createElement("div");
  el.className = "tycoon-msg user";
  const av = document.createElement("span");
  av.className = "tycoon-avatar";
  av.textContent = "You";
  const bubble = document.createElement("div");
  bubble.className = "tycoon-bubble";
  bubble.textContent = text;
  el.append(av, bubble);
  thread().appendChild(el);
  scrollThread();
  return el;
}

function addAiShell() {
  const el = document.createElement("div");
  el.className = "tycoon-msg ai";
  el.innerHTML = '<span class="tycoon-avatar">T</span><div class="tycoon-col"><div class="tycoon-bubble"><span class="tycoon-dots" aria-label="Tycoon is thinking"><span></span><span></span><span></span></span></div></div>';
  thread().appendChild(el);
  scrollThread();
  return el;
}

function typeOut(bubble, text, onDone) {
  // ChatGPT-style streaming reveal (server answers in one shot; we animate it).
  let i = 0;
  const chunk = Math.max(3, Math.ceil(text.length / 150));
  const timer = setInterval(() => {
    i = Math.min(text.length, i + chunk + Math.floor(Math.random() * 3));
    bubble.textContent = text.slice(0, i);
    scrollThread();
    if (i >= text.length) {
      clearInterval(timer);
      if (onDone) onDone();
    }
  }, 18);
}

function addActions(col, text) {
  const bar = document.createElement("div");
  bar.className = "tycoon-actions";
  const mk = (label, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  const copy = mk("Copy", async () => {
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = "Copied OK";
      setTimeout(() => { copy.textContent = "Copy"; }, 1600);
    } catch {}
  });
  const wa = mk("Share to WhatsApp", () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text.slice(0, 1500))}`, "_blank", "noopener");
  });
  bar.append(copy, wa);
  col.appendChild(bar);
}

function addErrorBubble(msg) {
  const el = document.createElement("div");
  el.className = "tycoon-msg ai error";
  el.innerHTML = '<span class="tycoon-avatar">T</span><div class="tycoon-col"><div class="tycoon-bubble"></div><div class="tycoon-actions"></div>';
  el.querySelector(".tycoon-bubble").textContent = msg;
  const bar = el.querySelector(".tycoon-actions");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => byId("tycoonForm").requestSubmit());
  bar.appendChild(retry);
  if (/pro plan|402|PRO_REQUIRED/i.test(msg)) {
    const up = document.createElement("a");
    up.className = "tycoon-upgrade";
    up.href = "/pricing.html?upgrade=pro";
    up.textContent = "Upgrade to Pro";
    bar.appendChild(up);
  }
  thread().appendChild(el);
  scrollThread();
}

async function ask(prompt) {
  if (busy || !prompt) return;
  busy = true;
  byId("tycoonSend").disabled = true;
  const emptyState = byId("tycoonEmpty");
  if (emptyState) emptyState.remove();
  addUserMsg(prompt);
  const shell = addAiShell();
  const bubble = shell.querySelector(".tycoon-bubble");
  try {
    const status = await apiFetch("/api/ai/status").catch(() => null);
    // A previous request can leave the server's diagnostic state as a
    // transient timeout. Do not block a fresh prompt on that stale flag: the
    // actual endpoint performs its bounded retry/fallback and returns the
    // authoritative provider error when a key/model really is unavailable.
    if (status && !status.configured) {
      throw new Error(status.hint || "NVIDIA AI is not configured on this deployment. Add NVIDIA_API_KEY in Vercel and redeploy.");
    }
    const leadId = byId("tycoonLead").value.trim();
    let lead = null;
    if (leadId) {
      try {
        const r = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}/report`);
        lead = r.lead;
      } catch {}
    }
    const r = await apiFetch("/api/ai/tycoon", {
      method: "POST",
      body: JSON.stringify({ prompt, leadId, lead: lead || {} })
    });
    lastAnswer = r.content || "";
    const col = shell.querySelector(".tycoon-col");
    typeOut(bubble, lastAnswer, () => addActions(col, lastAnswer));
  } catch (err) {
    const msg = String(err?.message || "Request failed.");
    shell.remove();
    addErrorBubble(msg);
  } finally {
    busy = false;
    byId("tycoonSend").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;

  const gate = byId("tycoonGate");
  try {
    const me = await apiFetch("/api/auth/me");
    const user = me.user;
    try { localStorage.setItem("mat_user", JSON.stringify(user)); } catch {}
    if (!isProUser(user)) {
      gate.innerHTML = `Business AI Tycoon is Pro/Admin only. <a href="/pricing.html?upgrade=pro"><strong>Upgrade to Pro</strong></a> to unlock scripts, pricing and WhatsApp closing.`;
      gate.classList.add("tycoon-gate-warn");
    } else {
      gate.textContent = `Tycoon unlocked for ${user.planName || user.subscription || "Pro"}. Ask anything.`;
      gate.classList.add("tycoon-gate-ok");
    }
  } catch (e) {
    gate.textContent = e.message;
    gate.classList.add("tycoon-gate-warn");
  }

  const box = byId("tycoonPrompt");
  emptyTemplate = byId("tycoonEmpty") ? byId("tycoonEmpty").outerHTML : "";

  const autosize = () => {
    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, 160) + "px";
  };
  box.addEventListener("input", autosize);

  byId("tycoonForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const prompt = box.value.trim();
    if (!prompt) return;
    box.value = "";
    autosize();
    ask(prompt);
  });

  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      byId("tycoonForm").requestSubmit();
    }
  });

  byId("tycoonNew").addEventListener("click", () => {
    if (busy) return;
    thread().innerHTML = emptyTemplate;
    lastAnswer = "";
    bindChips();
  });

  bindChips();
});

function bindChips() {
  document.querySelectorAll(".tycoon-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const text = chip.textContent.trim();
      const box = byId("tycoonPrompt");
      box.value = text;
      ask(text);
      box.value = "";
    });
  });
}

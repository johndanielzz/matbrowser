import { apiFetch, byId, isProUser, requireAuth } from "./api.js";

let busy = false;
let emptyTemplate = "";

function thread() { return byId("agentThread"); }

function scrollThread() {
  const target = thread();
  if (target) target.scrollTop = target.scrollHeight;
}

function addUserMessage(text) {
  const message = document.createElement("div");
  message.className = "tycoon-msg user";
  const avatar = document.createElement("span");
  avatar.className = "tycoon-avatar";
  avatar.textContent = "You";
  const bubble = document.createElement("div");
  bubble.className = "tycoon-bubble";
  bubble.textContent = text;
  message.append(avatar, bubble);
  thread().append(message);
  scrollThread();
}

function addPendingMessage() {
  const message = document.createElement("div");
  message.className = "tycoon-msg ai";
  message.innerHTML = '<span class="tycoon-avatar agent-avatar">A</span><div class="tycoon-col"><div class="tycoon-bubble"><span class="tycoon-dots" aria-label="Agent is analysing account data"><span></span><span></span><span></span></span></div></div>';
  thread().append(message);
  scrollThread();
  return message;
}

function addAgentMessage(text, isError = false) {
  const message = document.createElement("div");
  message.className = `tycoon-msg ai${isError ? " error" : ""}`;
  const avatar = document.createElement("span");
  avatar.className = "tycoon-avatar agent-avatar";
  avatar.textContent = "A";
  const column = document.createElement("div");
  column.className = "tycoon-col";
  const bubble = document.createElement("div");
  bubble.className = "tycoon-bubble";
  bubble.textContent = text;
  column.append(bubble);
  if (!isError) {
    const actions = document.createElement("div");
    actions.className = "tycoon-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.textContent = "Copied";
        setTimeout(() => { copy.textContent = "Copy"; }, 1400);
      } catch {
        copy.textContent = "Copy unavailable";
      }
    });
    actions.append(copy);
    column.append(actions);
  }
  message.append(avatar, column);
  thread().append(message);
  scrollThread();
}

function setBusy(isBusy) {
  busy = isBusy;
  const send = byId("agentSend");
  if (send) send.disabled = isBusy;
}

function updateSnapshot(metrics = {}, actionCount = 0) {
  byId("agentLeadCount").textContent = String(metrics.savedLeads ?? "—");
  byId("agentContactedCount").textContent = String(metrics.contactedLeads ?? "—");
  byId("agentWonCount").textContent = String(metrics.wonDeals ?? "—");
  byId("agentActionCount").textContent = String(actionCount ?? "—");
}

function renderActions(actions = []) {
  const target = byId("agentActions");
  if (!target) return;
  target.replaceChildren();
  for (const action of actions.slice(0, 4)) {
    const link = document.createElement("a");
    link.className = "agent-action";
    link.href = action.href || "/crm.html";
    const title = document.createElement("strong");
    title.textContent = action.title || "Review lead";
    const reason = document.createElement("span");
    reason.textContent = action.reason || "Open the relevant record.";
    const label = document.createElement("em");
    label.textContent = action.label || "Open";
    link.append(title, reason, label);
    target.append(link);
  }
}

async function refreshSnapshot() {
  const result = await apiFetch("/api/dashboard/metrics");
  updateSnapshot(result.metrics, result.metrics?.dailyActions?.length || 0);
  renderActions((result.metrics?.dailyActions || []).map((item) => ({
    title: item.title,
    reason: item.reason,
    label: item.actionLabel || "Open lead",
    href: item.leadId ? `/lead-details.html?id=${encodeURIComponent(item.leadId)}` : "/crm.html"
  })));
}

async function askAgent(prompt) {
  if (busy || !prompt) return;
  setBusy(true);
  byId("agentEmpty")?.remove();
  addUserMessage(prompt);
  const pending = addPendingMessage();
  try {
    const status = await apiFetch("/api/ai/status").catch(() => null);
    if (status && !status.configured) throw new Error(status.hint || "NVIDIA AI is not configured on this deployment. Add NVIDIA_API_KEY in Vercel and redeploy.");
    const result = await apiFetch("/api/ai/agent", { method: "POST", body: JSON.stringify({ prompt }) });
    pending.remove();
    addAgentMessage(String(result.content || "The agent returned no response. Please try again."));
    updateSnapshot(result.context?.metrics, result.context?.actions?.length || 0);
    renderActions(result.context?.actions || []);
  } catch (error) {
    pending.remove();
    addAgentMessage(String(error?.message || "The agent could not respond. Please try again."), true);
  } finally {
    setBusy(false);
  }
}

function bindChips() {
  document.querySelectorAll(".tycoon-chip").forEach((chip) => chip.addEventListener("click", () => askAgent(chip.textContent.trim())));
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  const gate = byId("agentGate");
  try {
    const me = await apiFetch("/api/auth/me");
    if (!isProUser(me.user)) {
      gate.innerHTML = 'AI Agent is available on Pro or Admin. <a href="/pricing.html?upgrade=pro"><strong>Upgrade to Pro</strong></a> to unlock account-aware guidance.';
      gate.classList.add("tycoon-gate-warn");
    } else {
      gate.textContent = "AI Agent is ready. It can read your account context but never sends messages or changes CRM records automatically.";
      gate.classList.add("tycoon-gate-ok");
    }
  } catch (error) {
    gate.textContent = error.message || "Unable to verify AI Agent access.";
    gate.classList.add("tycoon-gate-warn");
  }
  try { await refreshSnapshot(); } catch { updateSnapshot(); }
  emptyTemplate = byId("agentEmpty")?.outerHTML || "";
  const box = byId("agentPrompt");
  const autosize = () => {
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 160)}px`;
  };
  box.addEventListener("input", autosize);
  byId("agentForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = box.value.trim();
    if (!prompt) return;
    box.value = "";
    autosize();
    askAgent(prompt);
  });
  box.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      byId("agentForm").requestSubmit();
    }
  });
  byId("agentNew")?.addEventListener("click", () => {
    if (busy) return;
    thread().innerHTML = emptyTemplate;
    bindChips();
  });
  bindChips();
});

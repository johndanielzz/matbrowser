import { apiFetch, isProUser } from "./api.js";

let busy = false;

function createPanel() {
  const existing = document.getElementById("quickAiPanel");
  if (existing) return existing;
  const panel = document.createElement("section");
  panel.id = "quickAiPanel";
  panel.className = "quick-ai-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "quickAiTitle");
  panel.innerHTML = `
    <header class="quick-ai-header">
      <div><span class="quick-ai-kicker">MAT LEADS AI</span><h2 id="quickAiTitle">Ask your agent</h2><p>Account-aware guidance, right where you work.</p></div>
      <button type="button" class="icon-button" data-ai-quick-close aria-label="Close AI Agent">×</button>
    </header>
    <div class="quick-ai-messages" data-ai-quick-messages aria-live="polite">
      <div class="quick-ai-welcome"><strong>What should we work on?</strong><span>Ask about your saved leads, follow-ups, conversion rate, a feature that is not working, or your next best action.</span></div>
    </div>
    <div class="quick-ai-prompts"><button type="button" data-ai-prompt="Which lead should I contact first?">Contact priority</button><button type="button" data-ai-prompt="What are my most important actions today?">Today’s actions</button><button type="button" data-ai-prompt="Something in MAT LEADS is not working. Help me diagnose it step by step.">Report an issue</button></div>
    <form class="quick-ai-form" data-ai-quick-form><textarea data-ai-quick-input rows="1" placeholder="Ask a question or describe what is not working…" required></textarea><button class="quick-ai-send" type="submit" aria-label="Send message">→</button></form>
    <footer><a href="/ai-agent.html">Open full AI Agent</a><span>AI never sends messages or changes records automatically.</span></footer>
  `;
  document.body.append(panel);
  return panel;
}

function appendMessage(panel, text, role) {
  const message = document.createElement("div");
  message.className = `quick-ai-message quick-ai-message--${role}`;
  message.textContent = text;
  const list = panel.querySelector("[data-ai-quick-messages]");
  list.append(message);
  list.scrollTop = list.scrollHeight;
  return message;
}

function setOpen(panel, open) {
  panel.hidden = !open;
  panel.setAttribute("aria-hidden", String(!open));
  document.querySelectorAll("[data-ai-quick-toggle]").forEach((button) => button.setAttribute("aria-expanded", String(open)));
  document.body.classList.toggle("quick-ai-open", open);
  if (open) panel.querySelector("[data-ai-quick-input]")?.focus();
}

function resetClosedState(panel) {
  setOpen(panel, false);
  document.body.classList.remove("quick-ai-open");
  document.querySelectorAll("[data-ai-quick-toggle]").forEach((button) => button.setAttribute("aria-expanded", "false"));
}

async function sendMessage(panel, text) {
  if (busy || !text) return;
  const input = panel.querySelector("[data-ai-quick-input]");
  const send = panel.querySelector(".quick-ai-send");
  busy = true;
  if (input) input.disabled = true;
  if (send) send.disabled = true;
  panel.querySelector(".quick-ai-welcome")?.remove();
  appendMessage(panel, text, "user");
  const pending = appendMessage(panel, "Analysing your workspace…", "pending");
  try {
    const session = await apiFetch("/api/auth/me");
    const user = session?.user || {};
    if (!isProUser(user)) throw new Error("AI Agent chat is available on Pro or Admin plans. Open Pricing to upgrade when you are ready.");
    const status = await apiFetch("/api/ai/status");
    if (!status.configured) throw new Error(status.hint || "AI is not configured on this deployment.");
    const result = await apiFetch("/api/ai/agent", { method: "POST", body: JSON.stringify({ prompt: text }) });
    pending.remove();
    appendMessage(panel, String(result.content || "The agent returned no response. Please try again."), "agent");
  } catch (error) {
    pending.remove();
    appendMessage(panel, String(error?.message || "The agent could not respond. Please try again."), "error");
  } finally {
    busy = false;
    if (input) { input.disabled = false; input.focus(); }
    if (send) send.disabled = false;
  }
}

function init() {
  if (document.documentElement.dataset.aiQuickReady === "true") return;
  document.documentElement.dataset.aiQuickReady = "true";
  const panel = createPanel();
  resetClosedState(panel);
  if (!document.querySelector(".ai-quick-launcher")) {
    const launcher = document.createElement("button");
    launcher.className = "ai-quick-launcher";
    launcher.type = "button";
    launcher.dataset.aiQuickToggle = "";
    launcher.setAttribute("aria-controls", "quickAiPanel");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Open AI Agent");
    launcher.title = "Ask AI Agent";
    launcher.innerHTML = "<span aria-hidden=\"true\">AI</span>";
    document.body.append(launcher);
  }

  // Delegation makes the drawer reliable in cached/PWA pages where the
  // application shell can paint after this module is evaluated.
  document.addEventListener("click", (event) => {
    const launcher = event.target.closest("[data-ai-quick-toggle]");
    if (launcher) {
      event.preventDefault();
      setOpen(panel, panel.hidden);
      return;
    }
    if (event.target.closest("[data-ai-quick-close]")) {
      event.preventDefault();
      resetClosedState(panel);
    }
  });

  panel.querySelectorAll("[data-ai-prompt]").forEach((button) => button.addEventListener("click", () => sendMessage(panel, button.dataset.aiPrompt || "")));
  panel.querySelector("[data-ai-quick-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = panel.querySelector("[data-ai-quick-input]");
    const text = input?.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(panel, text);
  });
  panel.querySelector("[data-ai-quick-input]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      panel.querySelector("[data-ai-quick-form]")?.requestSubmit();
    }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) resetClosedState(panel); });
  window.addEventListener("pagehide", () => resetClosedState(panel), { once: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

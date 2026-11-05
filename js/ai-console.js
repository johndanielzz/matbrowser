import { apiFetch, byId, requireAuth } from "./api.js";

let lastPrompt = "";
let lastAnswer = "";
let running = false;

function setMeta(message, kind = "") {
  const meta = byId("aiConsoleMeta");
  if (!meta) return;
  meta.textContent = message;
  meta.className = kind ? `muted-value ${kind}` : "muted-value";
}

function setOutput(message, state = "") {
  const output = byId("aiConsoleOutput");
  if (!output) return;
  output.textContent = message;
  output.dataset.state = state || "idle";
}

function setRunning(isRunning) {
  running = isRunning;
  const run = byId("aiConsoleRun");
  if (run) {
    run.disabled = isRunning;
    run.textContent = isRunning ? "Generating..." : "Generate a real response";
  }
  const hasAnswer = Boolean(lastAnswer && lastPrompt);
  ["aiConsoleCopy", "aiConsoleRetry"].forEach((id) => {
    const button = byId(id);
    if (button) button.disabled = isRunning || !hasAnswer;
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy is unavailable in this browser.");
}

async function assertAiConfigured() {
  const status = await apiFetch("/api/ai/status").catch(() => null);
  if (status && !status.configured) {
    throw new Error(status.hint || "AI is not configured on the server. Add NVIDIA_API_KEY in Vercel, then redeploy.");
  }
  return status;
}

async function generate(prompt) {
  if (running) return;
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    setOutput("Enter a clear request before generating a response.", "error");
    setMeta("A prompt is required.", "error");
    return;
  }
  setRunning(true);
  setOutput("Preparing a response from the configured AI service...", "loading");
  setMeta("Checking the AI service...");
  try {
    const status = await assertAiConfigured();
    const result = await apiFetch("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ prompt: cleanPrompt })
    });
    const content = String(result.content || "").trim();
    if (!content) throw new Error("The AI service returned an empty response. Please try again.");
    lastPrompt = cleanPrompt;
    lastAnswer = content;
    setOutput(content, "success");
    const provider = result.provider || status?.provider;
    const model = result.model || status?.model;
    setMeta(provider ? `Response ready from ${provider}${model ? ` (${model})` : ""}. Review before using it.` : "Response ready. Review before using it.", "success");
  } catch (error) {
    lastAnswer = "";
    setOutput(`The AI could not respond. ${error.message || "Please try again."}`, "error");
    setMeta("No content was generated or sent.", "error");
  } finally {
    setRunning(false);
  }
}

function initAiConsole() {
  const form = byId("aiConsoleForm");
  const prompt = byId("prompt");
  if (!form || !prompt) return;
  setRunning(false);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAuth()) return;
    generate(prompt.value);
  });

  byId("aiConsoleCopy")?.addEventListener("click", async () => {
    if (!lastAnswer) return;
    try {
      await copyText(lastAnswer);
      setMeta("Response copied. It remains editable in this workspace.", "success");
    } catch (error) {
      setMeta(error.message || "Copy failed. Select the response and copy it manually.", "error");
    }
  });

  byId("aiConsoleRetry")?.addEventListener("click", () => generate(lastPrompt || prompt.value));
}

document.addEventListener("DOMContentLoaded", initAiConsole);

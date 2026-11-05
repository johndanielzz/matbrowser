import { byId, requireAuth } from "./api.js";

const STORAGE_KEY = "mat_work_planner_v1";

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((task) => task && typeof task.title === "string") : [];
  } catch {
    return [];
  }
}

let tasks = loadTasks();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function totalMinutes(items) {
  return items.reduce((sum, task) => sum + Number(task.minutes || 0), 0);
}

function renderMetrics() {
  const complete = tasks.filter((task) => task.complete);
  const revenue = tasks.filter((task) => task.type === "Revenue" && !task.complete);
  const planned = totalMinutes(tasks);
  const doneMinutes = totalMinutes(complete);
  byId("plannerMetrics").innerHTML = [
    ["Tasks complete", `${complete.length}/${tasks.length || 0}`],
    ["Focused time", `${doneMinutes}/${planned} min`],
    ["Revenue actions left", String(revenue.length)],
    ["Next best move", revenue[0]?.title || "Plan your next revenue action"]
  ].map(([label, value]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
}

function renderTasks() {
  const target = byId("taskList");
  if (!tasks.length) {
    target.innerHTML = '<div class="empty-state">No tasks yet. Add a task or load a Revenue Day plan.</div>';
    renderMetrics();
    return;
  }
  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  const ordered = [...tasks].sort((a, b) => Number(a.complete) - Number(b.complete) || (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));
  target.innerHTML = ordered.map((task) => `
    <article class="task-item ${task.complete ? "complete" : ""}">
      <input type="checkbox" data-task-toggle="${task.id}" ${task.complete ? "checked" : ""} aria-label="Mark ${escapeHtml(task.title)} complete">
      <div>
        <span class="task-priority">${escapeHtml(task.priority)} priority - ${escapeHtml(task.type)}</span>
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.minutes)} minute focus block</p>
      </div>
      <button class="task-delete" type="button" data-task-delete="${task.id}" aria-label="Delete ${escapeHtml(task.title)}">Delete</button>
    </article>
  `).join("");
  renderMetrics();
}

function addTask({ title, type, priority, minutes }) {
  tasks.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: String(title).trim().slice(0, 160),
    type,
    priority,
    minutes: Math.max(5, Math.min(480, Number(minutes) || 30)),
    complete: false,
    createdAt: new Date().toISOString()
  });
  persist();
  renderTasks();
}

function seedRevenueDay() {
  if (tasks.length && !window.confirm("Add the Revenue Day plan to your existing tasks?")) return;
  [
    ["Search for 20 qualified local business leads", "Lead generation", "High", 45],
    ["Send 10 personalized first outreach messages", "Revenue", "High", 45],
    ["Follow up with 10 warm leads", "Revenue", "High", 30],
    ["Create one proposal or invoice", "Revenue", "High", 30],
    ["Deliver the most important client task", "Client delivery", "Medium", 60],
    ["Publish one useful proof or offer post", "Marketing", "Medium", 25]
  ].forEach(([title, type, priority, minutes]) => addTask({ title, type, priority, minutes }));
}

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  renderTasks();

  byId("taskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = byId("taskTitle").value.trim();
    if (!title) return;
    addTask({ title, type: byId("taskType").value, priority: byId("taskPriority").value, minutes: byId("taskMinutes").value });
    event.currentTarget.reset();
    byId("taskMinutes").value = "30";
    byId("taskTitle").focus();
  });

  byId("taskList").addEventListener("change", (event) => {
    const id = event.target.dataset.taskToggle;
    if (!id) return;
    tasks = tasks.map((task) => task.id === id ? { ...task, complete: event.target.checked } : task);
    persist();
    renderTasks();
  });

  byId("taskList").addEventListener("click", (event) => {
    const id = event.target.closest("[data-task-delete]")?.dataset.taskDelete;
    if (!id) return;
    tasks = tasks.filter((task) => task.id !== id);
    persist();
    renderTasks();
  });

  byId("loadRevenueDay").addEventListener("click", seedRevenueDay);
  byId("clearDone").addEventListener("click", () => {
    tasks = tasks.filter((task) => !task.complete);
    persist();
    renderTasks();
  });
});

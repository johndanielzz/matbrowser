const storageKey = "mat-academy-progress-v1";

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeProgress(progress) {
  localStorage.setItem(storageKey, JSON.stringify([...progress]));
}

function initAcademy() {
  const modules = [...document.querySelectorAll("[data-academy-module]")];
  const total = modules.length;
  const progress = readProgress();
  const completed = document.querySelector("[data-academy-completed]");
  const totalNode = document.querySelector("[data-academy-total]");
  const bar = document.querySelector("[data-academy-progress]");
  const progressBar = document.querySelector("[role=progressbar]");
  const copy = document.querySelector("[data-academy-progress-copy]");

  function render() {
    let completeCount = 0;
    modules.forEach((module) => {
      const complete = progress.has(module.dataset.academyModule);
      if (complete) completeCount += 1;
      module.classList.toggle("is-complete", complete);
      const status = module.querySelector("[data-academy-status]");
      const button = module.querySelector("[data-academy-complete]");
      if (status) status.textContent = complete ? "Complete" : "Not started";
      if (button) {
        button.textContent = complete ? "Completed ✓" : "Mark module complete";
        button.setAttribute("aria-pressed", String(complete));
      }
    });
    if (completed) completed.textContent = String(completeCount);
    if (totalNode) totalNode.textContent = String(total);
    const percent = total ? Math.round((completeCount / total) * 100) : 0;
    if (bar) bar.style.width = `${percent}%`;
    if (progressBar) progressBar.setAttribute("aria-valuenow", String(completeCount));
    if (copy) copy.textContent = completeCount === total ? "Course complete. Use your dashboard to keep the process going." : completeCount ? `${total - completeCount} module${total - completeCount === 1 ? "" : "s"} left. Keep the momentum.` : "Start with your first market search.";
  }

  modules.forEach((module) => module.querySelector("[data-academy-complete]")?.addEventListener("click", () => {
    const id = module.dataset.academyModule;
    if (progress.has(id)) progress.delete(id); else progress.add(id);
    writeProgress(progress);
    render();
  }));

  document.querySelector("[data-academy-reset]")?.addEventListener("click", () => {
    if (!progress.size || !window.confirm("Reset your saved Academy progress on this device?")) return;
    progress.clear();
    writeProgress(progress);
    render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", initAcademy);

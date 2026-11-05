/* Safe first-party runtime for published MAT LEADS sites. */
(function websiteRuntime() {
  "use strict";
  const pageSections = Array.from(document.querySelectorAll("section.pg[id]"));
  const pageIdFromLink = (link) => {
    const explicitId = (String(link.getAttribute("href") || "").match(/#([A-Za-z0-9_-]+)/) || [])[1];
    if (explicitId) return explicitId;
    // Older Studio sites used href="#" and an inline handler. The server strips
    // that unsafe handler, so retain their navigation by matching link order.
    const index = Array.from(document.querySelectorAll(".nav-a[href]")).indexOf(link);
    return pageSections[index]?.id || "";
  };
  function showPage(pageId, updateHash) {
    if (!pageSections.length || !pageId) return false;
    const active = pageSections.find((section) => section.id === pageId);
    if (!active) return false;
    pageSections.forEach((section) => {
      section.hidden = section !== active;
      // Clear the display:none used by older generated sites when activating a
      // page, then retain a clean fallback for users without JS.
      section.style.display = section === active ? "" : "none";
      section.setAttribute("aria-hidden", section === active ? "false" : "true");
    });
    document.querySelectorAll(".nav-a[href]").forEach((link) => { const isActive = pageIdFromLink(link) === pageId; link.classList.toggle("active", isActive); if (isActive) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); });
    if (updateHash && window.location.hash !== `#${pageId}`) history.replaceState(null, "", `#${pageId}`);
    return true;
  }
  document.addEventListener("click", (event) => {
    const link = event.target.closest(".nav-a[href]");
    if (link && showPage(pageIdFromLink(link), true)) event.preventDefault();
    if (window.parent !== window) {
      const target = event.target.closest("h1,h2,h3,p,a,button,img,section");
      // The editor preview is intentionally sandboxed with an opaque origin.
      // The parent verifies event.source, so a wildcard target is safer and
      // more reliable here than granting allow-same-origin to generated HTML.
      if (target) window.parent.postMessage({ type: "mat-site-selection", tagName: target.tagName.toLowerCase(), id: target.id || "", text: String(target.textContent || target.getAttribute("alt") || "").trim().slice(0, 280), href: target.getAttribute("href") || "" }, "*");
    }
  });
  window.addEventListener("hashchange", () => showPage(window.location.hash.slice(1), false));
  if (pageSections.length) showPage(window.location.hash.slice(1) || pageSections[0].id, false);
  document.querySelectorAll("form").forEach((form) => {
    const action = String(form.getAttribute("action") || "").trim();
    if (action && action !== "#") return;
    form.addEventListener("submit", (event) => { event.preventDefault(); let note = form.querySelector("[data-form-status]"); if (!note) { note = document.createElement("p"); note.dataset.formStatus = "true"; note.setAttribute("role", "status"); form.appendChild(note); } note.textContent = "This form needs a configured delivery endpoint before it can send messages."; });
  });
}());

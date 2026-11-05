// MAT LEADS install, update, offline, and browser-notification controls.
(function () {
  "use strict";

  let deferredPrompt = null;
  let registration = null;

  function isInstalled() {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function setNotificationStatus(message, state = "") {
    document.querySelectorAll("[data-pwa-notification-status]").forEach((node) => {
      node.textContent = message;
      node.dataset.state = state;
    });
  }

  function notificationSupport() {
    if (!("Notification" in window)) return { supported: false, permission: "unsupported" };
    return { supported: true, permission: Notification.permission };
  }

  async function requestNotifications() {
    const support = notificationSupport();
    if (!support.supported) throw new Error("Browser notifications are not supported on this device.");
    if (support.permission === "denied") throw new Error("Notifications are blocked. Enable them in your browser or device settings.");
    const permission = support.permission === "granted" ? "granted" : await Notification.requestPermission();
    setNotificationStatus(permission === "granted" ? "Notifications are enabled on this device." : "Notification permission was not granted.", permission === "granted" ? "success" : "error");
    return permission;
  }

  async function showNotification(title, options = {}) {
    const permission = await requestNotifications();
    if (permission !== "granted") return false;
    const opts = {
      body: options.body || "Open MAT LEADS to review your next best action.",
      icon: "/assets/logo-mark.svg",
      badge: "/assets/logo-mark.svg",
      tag: options.tag || "mat-leads-notification",
      data: { url: options.url || "/dashboard.html", ...(options.data || {}) },
      renotify: Boolean(options.renotify)
    };
    if (registration?.showNotification) await registration.showNotification(title, opts);
    else new Notification(title, opts);
    return true;
  }

  function ensureInstallBanner() {
    if (isInstalled() || document.querySelector("[data-pwa-install-banner]")) return;
    const banner = document.createElement("aside");
    banner.className = "pwa-install-banner";
    banner.dataset.pwaInstallBanner = "true";
    banner.setAttribute("aria-label", "Install MAT LEADS");
    banner.innerHTML = `<img src="/assets/logo-mark.svg" alt="" width="34" height="34"><div><strong>Install MAT LEADS</strong><span>Keep your workspace one tap away.</span></div><button class="btn btn-primary" type="button" data-pwa-install>Install</button><button class="icon-button" type="button" data-pwa-install-dismiss aria-label="Dismiss install offer">×</button>`;
    document.body.appendChild(banner);
    // Normalize the dismiss glyph for hosts that serve legacy text encoding.
    const dismissButton = banner.querySelector("[data-pwa-install-dismiss]");
    if (dismissButton) dismissButton.textContent = "x";
    banner.querySelector("[data-pwa-install]")?.addEventListener("click", installApp);
    banner.querySelector("[data-pwa-install-dismiss]")?.addEventListener("click", () => {
      banner.remove();
      try { sessionStorage.setItem("mat-pwa-install-dismissed", "1"); } catch {}
    });
  }

  function showInstallBanner() {
    if (isInstalled()) return;
    try { if (sessionStorage.getItem("mat-pwa-install-dismissed") === "1") return; } catch {}
    ensureInstallBanner();
  }

  async function installApp() {
    if (!deferredPrompt) {
      showInstallBanner();
      return false;
    }
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (choice.outcome === "accepted") document.querySelector("[data-pwa-install-banner]")?.remove();
    return choice.outcome === "accepted";
  }

  function showUpdateBanner(waitingWorker) {
    if (document.querySelector("[data-pwa-update]")) return;
    const banner = document.createElement("aside");
    banner.className = "pwa-update-banner";
    banner.dataset.pwaUpdate = "true";
    banner.innerHTML = `<span><strong>New MAT LEADS version ready.</strong> Refresh to apply the latest improvements.</span><button class="btn btn-primary" type="button" data-pwa-update-apply>Refresh</button>`;
    document.body.appendChild(banner);
    banner.querySelector("[data-pwa-update-apply]")?.addEventListener("click", () => {
      // Wait for activation before reloading so the first refresh actually uses
      // the new worker. The timeout keeps the button reliable in older browsers
      // that do not emit controllerchange consistently.
      let reloaded = false;
      const reload = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };
      navigator.serviceWorker?.addEventListener("controllerchange", reload, { once: true });
      waitingWorker?.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(reload, 1500);
    });
  }

  function updateOfflineStatus() {
    document.querySelectorAll("[data-pwa-connection]").forEach((node) => {
      const offline = !navigator.onLine;
      node.textContent = offline ? "Offline mode · cached workspace available" : "Online · workspace synced when you save";
      node.dataset.state = offline ? "offline" : "online";
      node.textContent = offline ? "Offline mode - cached workspace available" : "Online - workspace synced when you save";
    });
  }

  function initNotificationControls() {
    const support = notificationSupport();
    const enable = document.querySelector("[data-pwa-notification-enable]");
    const test = document.querySelector("[data-pwa-notification-test]");
    if (enable) {
      enable.disabled = !support.supported;
      enable.textContent = support.permission === "granted" ? "Notifications enabled" : "Enable notifications";
      if (support.permission === "granted") enable.setAttribute("aria-pressed", "true");
      enable.addEventListener("click", async () => {
        try { await requestNotifications(); enable.textContent = "Notifications enabled"; enable.setAttribute("aria-pressed", "true"); }
        catch (error) { setNotificationStatus(error.message, "error"); }
      });
    }
    test?.addEventListener("click", async () => {
      try {
        const shown = await showNotification("MAT LEADS is ready", { body: "Your notification channel is working. Review today’s actions when you are ready.", tag: "mat-leads-test" });
        if (shown) setNotificationStatus("Test notification sent to this device.", "success");
      } catch (error) { setNotificationStatus(error.message, "error"); }
    });
    updateOfflineStatus();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner(worker);
        });
      });
    }).catch((error) => console.warn("[PWA] Service Worker registration failed", error));
  }

  window.MatPwa = { install: installApp, requestNotifications, notify: showNotification, status: notificationSupport };
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredPrompt = event; showInstallBanner(); });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; document.querySelector("[data-pwa-install-banner]")?.remove(); });
  window.addEventListener("online", updateOfflineStatus);
  window.addEventListener("offline", updateOfflineStatus);

  const ready = () => { registerServiceWorker(); initNotificationControls(); if (deferredPrompt) showInstallBanner(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else ready();
}());

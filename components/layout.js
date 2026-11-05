import { apiFetch, hasStoredSession, isProUser } from "../js/api.js";

// The sidebar is grouped so 25+ destinations stay scannable. Each item
// carries an explicit `page` key — it matches the `data-page` attribute on
// the page body. Deriving it from the label used to leave most tool pages
// without an active highlight.
const navGroups = [
  {
    label: "Leads",
    items: [
      { href: "/dashboard.html", page: "dashboard", label: "Dashboard", icon: "D" },
      { href: "/crm.html", page: "crm", label: "CRM", icon: "C" },
      { href: "/lead-details.html", page: "lead-details", label: "Lead Details", icon: "L" },
      { href: "/community.html", page: "community", label: "Chat", icon: "M" }
    ]
  },
  {
    label: "Websites",
    items: [
      { href: "/website-studio.html", page: "website-studio", label: "Website Studio", icon: "W", pro: true },
      { href: "/website-editor.html", page: "website-editor", label: "Website Editor", icon: "E", pro: true },
      { href: "/business-ai.html", page: "business-ai", label: "Business AI", icon: "B", pro: true },
      { href: "/ai-agent.html", page: "ai-agent", label: "AI Agent", icon: "A", pro: true },
      { href: "/outreach.html", page: "outreach", label: "Outreach", icon: "O" },
      { href: "/proposals.html", page: "proposals", label: "Client Closer", icon: "P" }
      ,{ href: "/playbook.html", page: "playbook", label: "Growth Playbook", icon: "G", pro: true }
    ]
  },
  {
    label: "Business Tools",
    items: [
      { href: "/tools.html", page: "tools", label: "Tools Hub", icon: "T" },
      { href: "/work-planner.html", page: "work-planner", label: "Work Planner", icon: "K" },
      { href: "/money.html", page: "money", label: "Money Toolkit", icon: "$" },
      { href: "/freelance.html", page: "freelance", label: "Freelancer", icon: "F" },
      { href: "/digital.html", page: "digital", label: "Digital Products", icon: "D" },
      { href: "/content.html", page: "content", label: "Content Studio", icon: "C" },
      { href: "/sales.html", page: "sales", label: "Sales Copy", icon: "S" },
      { href: "/social.html", page: "social", label: "Social Manager", icon: "S" },
      { href: "/ecommerce.html", page: "ecommerce", label: "E-commerce", icon: "$" },
      { href: "/affiliate.html", page: "affiliate", label: "Affiliate", icon: "%" },
      { href: "/coaching.html", page: "coaching", label: "Coaching", icon: "C" }
    ]
  },
  {
    label: "Earn",
    items: [
      { href: "/earn.html", page: "earn", label: "Earn Hub", icon: "E" },
      { href: "/gigs.html", page: "gigs", label: "Gigs", icon: "G" },
      { href: "/students.html", page: "students", label: "Earn Starter", icon: "E" },
      { href: "/learn.html", page: "learn", label: "Learn", icon: "T" },
      { href: "/academy.html", page: "academy", label: "Academy", icon: "A" }
    ]
  },
  {
    label: "Account",
    items: [
      { href: "/reports.html", page: "reports", label: "Reports", icon: "R" },
      { href: "/analytics.html", page: "analytics", label: "Analytics", icon: "A" },
      { href: "/pricing.html", page: "pricing", label: "Pricing", icon: "$" },
      { href: "/profile.html", page: "profile", label: "Profile", icon: "F" },
      { href: "/settings.html", page: "settings", label: "Settings", icon: "S" }
    ]
  }
];

// Flat list, kept for anything that needs every destination.
export const navItems = navGroups.flatMap((group) => group.items);

function isAdminAccount(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

function adminLinkMarkup() {
  const active = document.body.dataset.page || "";
  return `
    <div class="nav-group">
      <p class="nav-group__label">Admin</p>
      <a href="/admin.html" class="${active === "admin" ? "active" : ""}">
        <span aria-hidden="true">M</span>
        <span>Admin</span>
      </a>
    </div>
  `;
}

// The Admin entry exists only while the signed-in account is an admin —
// normal users never see it, and it disappears the moment role changes.
function syncAdminNavItem(user) {
  const nav = document.querySelector("#sidebar nav");
  if (!nav) return;
  const existing = nav.querySelector('a[href="/admin.html"]');
  if (isAdminAccount(user)) {
    if (!existing) nav.insertAdjacentHTML("beforeend", adminLinkMarkup());
  } else if (existing) {
    existing.remove();
  }
}

// Pro-gated destinations carry a badge. When the account already has a Pro
// plan the badge turns solid so the sidebar shows what is actually unlocked,
// instead of every entry looking like it is still behind a paywall.
function syncProNavState(user) {
  const unlocked = isProUser(user);
  document.querySelectorAll('#sidebar a[data-nav-pro]').forEach((link) => {
    link.classList.toggle("is-unlocked", unlocked);
    link.classList.toggle("is-locked", !unlocked);
  });
}

function brandMarkup() {
  return `
    <a class="brand" href="/index.html" aria-label="MAT Leads AI Pro X home">
      <img src="/assets/logo-mark.svg" alt="" width="34" height="34">
      <span>MAT LEADS AI PRO X</span>
    </a>
  `;
}

function injectPwaMeta() {
  if (document.querySelector('link[rel="manifest"]')) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = '/manifest.webmanifest';
  document.head.appendChild(link);

  const appleIcon = document.createElement('link');
  appleIcon.rel = 'apple-touch-icon';
  appleIcon.href = '/assets/logo-mark.svg';
  document.head.appendChild(appleIcon);

  const appleTitle = document.createElement('meta');
  appleTitle.name = 'apple-mobile-web-app-title';
  appleTitle.content = 'MAT Leads';
  document.head.appendChild(appleTitle);

  const appleCapable = document.createElement('meta');
  appleCapable.name = 'apple-mobile-web-app-capable';
  appleCapable.content = 'yes';
  document.head.appendChild(appleCapable);

  const themeColor = document.createElement('meta');
  themeColor.name = 'theme-color';
  themeColor.content = '#101828';
  document.head.appendChild(themeColor);
}

function initTheme() {
  const savedTheme = localStorage.getItem("mat-theme") || "light";
  document.documentElement.dataset.theme = savedTheme;
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("mat-theme", next);
}

function initPublicNav() {
  const target = document.querySelector("[data-public-nav]");
  if (!target) return;

  target.innerHTML = `
    ${brandMarkup()}
    <nav class="public-nav__links" aria-label="Primary">
      <a href="/index.html#lead-engine">Lead Engine</a>
      <a href="/index.html#ai">AI Analyzer</a>
      <a href="/about.html">About</a>
      <a href="/features/phone-lead-generation">Features</a>
      <a href="/faq.html">FAQ</a>
      <a href="/login.html?next=/academy.html">Academy</a>
      <a href="/pricing.html">Pricing</a>
      <a href="/login.html">Login</a>
    </nav>
    <div class="public-nav__actions">
      <button class="icon-button" type="button" data-theme-toggle aria-label="Toggle theme">T</button>
      <a class="btn btn-secondary" href="/login.html">Login</a>
      <a class="btn btn-primary" href="/signup.html">Start Free Trial</a>
    </div>
  `;
}

function initAppShell() {
  const shell = document.querySelector("[data-app-shell]");
  if (!shell) return;

  const active = document.body.dataset.page || "";
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.id = "sidebar";
  sidebar.innerHTML = `
    <div class="sidebar-header">
      ${brandMarkup()}
      <button class="icon-button sidebar-close" type="button" data-sidebar-close aria-label="Close sidebar">×</button>
    </div>
    <nav aria-label="Application">
      ${navGroups.map((group) => `
        <div class="nav-group">
          <p class="nav-group__label">${group.label}</p>
          ${group.items.map((item) => `
            <a href="${item.href}" class="${active === item.page ? "active" : ""}"${item.pro ? ' data-nav-pro="1"' : ""}>
              <span aria-hidden="true">${item.icon}</span>
              <span>${item.label}</span>
              ${item.pro ? '<em class="nav-pro-badge">Pro</em>' : ""}
            </a>
          `).join("")}
        </div>
      `).join("")}
    </nav>
    <div class="sidebar-ai-entry">
      <button class="sidebar-ai-launcher" type="button" data-ai-quick-toggle aria-controls="quickAiPanel" aria-expanded="false" aria-label="Open AI Agent">
        <span class="sidebar-ai-mark" aria-hidden="true">AI</span>
        <span><strong>Ask AI Agent</strong><small>Get your next best action</small></span>
      </button>
      <button class="sidebar-theme-toggle" type="button" data-theme-toggle aria-label="Toggle theme" title="Toggle light and dark theme"><span aria-hidden="true">T</span><span>Theme</span></button>
    </div>
  `;

  // Admin nav is role-gated: rendered immediately when the cached account is
  // an admin, otherwise injected later once /api/auth/me confirms the role.
  let cachedUser = null;
  try { cachedUser = JSON.parse(localStorage.getItem("mat_user") || "null"); } catch {}
  if (isAdminAccount(cachedUser)) {
    sidebar.querySelector("nav")?.insertAdjacentHTML("beforeend", adminLinkMarkup());
  }

  const workspace = shell.querySelector(".workspace");
  const topbar = document.createElement("header");
  topbar.className = "topbar";
  topbar.innerHTML = `
    <button class="icon-button mobile-menu hamburger-button" type="button" data-menu-toggle aria-controls="sidebar" aria-label="Open navigation" aria-expanded="false">
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
    </button>
    <div class="topbar-status-stack" aria-live="polite"><div class="notice topbar-announcement" role="status" data-session-badge>NVIDIA-only AI pipeline connected through secure server endpoints.</div><span class="pwa-connection-status" data-pwa-connection role="status" aria-live="polite">Online</span></div>
    <div class="topbar-actions">
      <a class="btn btn-secondary" href="/reports.html">Reports</a>
      <a class="btn btn-primary" href="/dashboard.html">Search Leads</a>
    </div>
  `;

  shell.prepend(sidebar);
  workspace.prepend(topbar);

  // The compact assistant is deliberately loaded only inside the signed-in
  // workspace. It uses the same server-authorized AI route as the full Agent
  // page, so no provider key or client-side fallback is introduced here.
  if (!document.querySelector('script[src="/js/ai-quick-chat.js"]')) {
    const quickAiScript = document.createElement("script");
    quickAiScript.type = "module";
    quickAiScript.src = "/js/ai-quick-chat.js";
    document.body.appendChild(quickAiScript);
  }

  // Paint the Pro badge state from the cached account right away so the
  // sidebar never flashes the locked styling before /api/auth/me resolves.
  syncProNavState(cachedUser);
}

function sessionText(user) {
  if (user?.role === "admin" || user?.entitlements?.unlimitedAccess) {
    return "Admin Unlimited Access: every feature is unlocked with no billing required.";
  }
  if (user?.subscription === "trial" || user?.billingStatus === "trial" || user?.entitlements?.trial) {
    const used = Number(user.trialSearchesUsed || user.entitlements?.trialSearchesUsed || 0);
    const limit = Number(user.trialSearchLimit || user.entitlements?.trialSearchLimit || 2);
    const leadLimit = Number(user.trialLeadLimit || user.entitlements?.trialLeadLimit || 5);
    return `Free Trial active: ${Math.max(0, limit - used)} of ${limit} searches left, ${leadLimit} leads per search.`;
  }
  return `${user?.planName || user?.subscription || "Starter"} workspace active.`;
}

async function initSessionBadge() {
  const target = document.querySelector("[data-session-badge]");
  if (!target) return;

  let announcements = [];
  let announcementIndex = 0;
  const paintAnnouncement = (value) => { target.textContent = value; target.classList.remove("is-changing"); void target.offsetWidth; target.classList.add("is-changing"); };
  const setAnnouncements = (user) => {
    const primary = sessionText(user);
    announcements = [primary, "Secure workspace: saved records stay linked to your account.", "AI tools are ready when you need a faster next action."];
    announcementIndex = 0;
    paintAnnouncement(announcements[0]);
  };
  const rotate = () => {
    if (announcements.length < 2) return;
    announcementIndex = (announcementIndex + 1) % announcements.length;
    paintAnnouncement(announcements[announcementIndex]);
  };
  window.setInterval(rotate, 8000);

  const cached = localStorage.getItem("mat_user");
  if (cached) {
    try {
      const user = JSON.parse(cached);
      setAnnouncements(user);
      syncProNavState(user);
    } catch {
      setAnnouncements({});
    }
  }

  if (!hasStoredSession()) {
    setAnnouncements({ planName: "Login required" });
    syncAdminNavItem(null);
    syncProNavState(null);
    return;
  }

  try {
    const result = await apiFetch("/api/auth/me");
    const user = result.user;
    localStorage.setItem("mat_user", JSON.stringify(user));
    setAnnouncements(user);
    syncAdminNavItem(user);
    syncProNavState(user);
  } catch {
    setAnnouncements({});
  }
}

function initMenu() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-menu-toggle]");
    const close = event.target.closest("[data-sidebar-close]");
    const sidebar = document.getElementById("sidebar");
    const shell = document.querySelector("[data-app-shell]");
    const setOpen = (open) => {
      if (!sidebar) return;
      sidebar.classList.toggle("open", open);
      shell?.classList.toggle("sidebar-collapsed", !open && window.innerWidth > 820);
      document.body.classList.toggle("locked", open && window.innerWidth <= 820);
      document.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", String(open));
      document.querySelector("[data-menu-toggle]")?.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    };
    if (close && sidebar) {
      setOpen(false);
      document.querySelector("[data-menu-toggle]")?.focus();
      return;
    }
    if (toggle && sidebar) {
      setOpen(!sidebar.classList.contains("open") || shell?.classList.contains("sidebar-collapsed"));
      return;
    }

    if (sidebar?.classList.contains("open") && !event.target.closest(".sidebar")) {
      setOpen(false);
    }
  });

  const sidebar = document.getElementById("sidebar");
  if (sidebar && window.innerWidth > 820) sidebar.classList.add("open");
}

function initThemeButtons() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-theme-toggle]")) {
      toggleTheme();
    }
  });
}

initTheme();
injectPwaMeta();
document.addEventListener("DOMContentLoaded", () => {
  initPublicNav();
  initAppShell();
  initMenu();
  initThemeButtons();
  initSessionBadge();

  // Load PWA registration script
  if (!document.querySelector('script[src="/js/pwa.js"]')) {
    const pwaScript = document.createElement('script');
    pwaScript.src = '/js/pwa.js';
    document.body.appendChild(pwaScript);
  }
});

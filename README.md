# MAT Browser

A browser that runs in your browser window. Every site opens inside MAT's own tabs and nothing redirects you elsewhere.
MAT fetches each page on its server, removes ads and trackers, then shows you the clean result.

## Run it

You need Node 18.14 or newer (https://nodejs.org). No packages to install.

    node server.js

Open http://127.0.0.1:8080

## Install as an app

Open MAT Browser in a Chromium-based browser and choose **Install MAT Browser** from the address-bar install button or
the browser menu. The app manifest, service worker, and matching MAT icon are included in `public/`.

## GitHub and Vercel

This repository includes `vercel.json` and a serverless adapter at `api/index.mjs`. Push the project to GitHub, import the
repository in Vercel, and deploy with the default Node.js settings. For local use, continue to run `npm start`.

The proxy keeps session state in memory. A single local process is the recommended deployment for persistent site
cookies; serverless deployments may lose sessions when functions scale down or restart.

## Watch parties

Movie Mode includes a private, expiring watch-party link that synchronizes permitted video play, pause, and seek events.
On Vercel, room state is in-memory and is therefore only a preview implementation: instances can restart or scale
independently. Use a shared datastore such as Vercel KV or Redis before relying on watch parties in production.

## What it does

- Tabs, private tabs, back and forward per tab, bookmarks bar, history, speed dial, zoom
- Address bar that searches or opens sites, with suggestions from the web, your bookmarks and your history
- Search engines: DuckDuckGo, Brave, Mojeek, Bing, Startpage, Wikipedia, Google
- Shield: removes ad and tracker scripts, frames and pixels (about 140 hosts plus path rules), hides leftover ad boxes,
  strips utm_*, fbclid, gclid and other tracking tags, upgrades http to https, optionally turns off all page scripts
- Site cookies are kept on the server so logins work, and never reach the browser window
- Dark pages mode, light and dark window themes
- Safety guard: the proxy refuses addresses on private networks (set ALLOW_PRIVATE=1 only for testing)

## Settings (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| PORT | 8080 | Browser window |
| CONTENT_PORT | PORT + 1 | Pages, on their own port so they cannot touch the window |
| HOST | 127.0.0.1 | Use 0.0.0.0 to reach it from other devices on your network |
| CONTENT_ORIGIN | derived | Full origin for pages if you put MAT behind a reverse proxy |
| ALLOW_PRIVATE | 0 | Set to 1 to allow private network addresses |

## Limits you should know about

- Sites that need heavy scripting (some video players, web apps with WebSockets) may not work, and a script that sets
  `location.href` directly can leave the proxy.
- Sites that detect proxies or datacenter addresses, such as Google or Cloudflare-protected pages, may show a CAPTCHA.
  Running MAT on your home computer avoids most of this.
- If you set HOST=0.0.0.0, anyone who can reach the port can use your MAT. Add a password at a reverse proxy first.

# MAT Browser

MAT has two supported runtimes: a hosted web workspace and a real desktop browser powered by Electron/Chromium.
The desktop runtime loads sites directly in native browser tabs, while the hosted runtime uses the privacy proxy
where a normal website's security rules allow it.

## Run it

You need Node 18.14 or newer (https://nodejs.org). No packages to install.

    node server.js

Open http://127.0.0.1:8080

Before pushing or redeploying, run `npm run verify` to validate both the local server and Vercel function entry point.

## Real desktop browser

For unrestricted, native Chromium browsing inside MAT tabs, install the desktop runtime:

    npm install
    npm run desktop

The desktop app keeps the MAT tab bar, bookmarks, history, Movie Mode and privacy controls, but pages are loaded by
Chromium directly instead of an iframe. This is the reliable option for sites that reject Vercel IPs, deny framing,
or require modern JavaScript, login flows, media playback, and WebSockets. Ad/tracker requests are blocked locally
by the desktop session; site permissions are denied by default.

## Install as an app

Open MAT Browser in a Chromium-based browser and choose **Install MAT Browser** from the address-bar install button or
the browser menu. The app manifest, service worker, and matching MAT icon are included in `public/`.

## GitHub and Vercel

This repository includes `vercel.json` and a serverless adapter at `api/index.mjs`. Push the project to GitHub, import the
repository in Vercel, and deploy with the default Node.js settings. For local use, continue to run `npm start`.

Vercel cannot become a full native browser because browser security policies prevent a website from embedding every
other website. Use `npm run desktop` for the real browsing runtime.

The proxy keeps session state in memory. A single local process is the recommended deployment for persistent site
cookies; serverless deployments may lose sessions when functions scale down or restart.

After a Vercel redeploy, check `/api/health`. It should return JSON with `ok: true`. If Vercel shows a function
invocation error, open the deployment's **Functions → Logs** and use the first stack-trace line; a generic 500 screen
does not contain the root cause.

## Watch parties

Movie Mode includes a private, expiring watch-party link that synchronizes permitted video play, pause, and seek events.
On Vercel, room state is in-memory and is therefore only a preview implementation: instances can restart or scale
independently. Use a shared datastore such as Vercel KV or Redis before relying on watch parties in production.

## What it does

- Tabs, private tabs, back and forward per tab, bookmarks bar, history, speed dial, zoom
- Address bar that searches or opens sites, with suggestions from the web, your bookmarks and your history
- Search engines: DuckDuckGo, Brave, Mojeek, Bing, Startpage, Wikipedia, Google, Yahoo, Ecosia and Qwant
- Web searches and normal pages stay inside MAT's internal tab view. If a provider blocks the server
  request, MAT shows an in-app recovery screen with alternate search routes instead of opening an
  external browser tab.
- On Vercel, rejected search providers automatically fall back to Bing, then Google/Wikipedia when
  available, while preserving the query and the MAT tab. This is necessary because some providers
  reject shared cloud egress IPs even though the same URL works from localhost.
- A non-empty query sent to known Vercel-blocked providers is routed to the reliable fallback before
  the provider is contacted, so URLs such as `duckduckgo.com/?q=ANIME` do not render an error page.
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
- Sites that detect proxies or datacenter addresses, such as Google or Cloudflare-protected pages, may show a CAPTCHA
  or an in-app provider-unavailable screen. This is an upstream restriction; MAT keeps the experience inside its own
  tab and provides alternate routes.
- If you set HOST=0.0.0.0, anyone who can reach the port can use your MAT. Add a password at a reverse proxy first.

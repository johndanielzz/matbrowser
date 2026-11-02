'use strict';
/*
  MAT Browser server. No dependencies, Node 18.14 or newer.

  Two listeners:
    PORT          the browser window (tabs, address bar, settings)
    CONTENT_PORT  the pages themselves, fetched and cleaned by this server

  Pages live on their own port so they are a different origin from the browser window and cannot reach it.
*/
const http = require('http');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const BL = require('./blocklist');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = +process.env.PORT || 8080;
const CPORT = +process.env.CONTENT_PORT || PORT + 1;
const CONTENT_ORIGIN = process.env.CONTENT_ORIGIN || '';
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_BODY = 25 * 1024 * 1024;

/* ---------- sessions: settings, cookie jar, counters ---------- */
const DEFAULTS = { adblock: true, strip: true, https: true, cookies: true, nojs: false, dark: false, movie: false };
const sessions = new Map();
const parties = new Map();
function newSession() { return { jar: new Map(), s: { ...DEFAULTS }, stats: { blocked: 0, stripped: 0, upgraded: 0 } }; }
function sidFrom(req) { const m = /(?:^|;\s*)mat_sid=([a-f0-9]{32})/.exec(req.headers.cookie || ''); return m && m[1]; }
function getSession(req, res, create) {
  let sid = sidFrom(req);
  if (sid) { if (!sessions.has(sid)) sessions.set(sid, newSession()); return sessions.get(sid); }
  if (!create) return newSession();
  sid = crypto.randomBytes(16).toString('hex');
  sessions.set(sid, newSession());
  res.setHeader('Set-Cookie', `mat_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  return sessions.get(sid);
}

/* ---------- cookie jar for the sites you visit (kept here, never in your browser) ---------- */
function jarStore(sess, host, setCookies) {
  for (const raw of setCookies) {
    const parts = raw.split(';').map(x => x.trim());
    const eq = parts[0].indexOf('=');
    if (eq < 1) continue;
    const name = parts[0].slice(0, eq), value = parts[0].slice(eq + 1);
    let domain = host, dead = false;
    for (const p of parts.slice(1)) {
      const [k, v = ''] = p.split('=');
      const key = k.toLowerCase();
      if (key === 'domain' && v) { const d = v.replace(/^\./, '').toLowerCase(); if (host === d || host.endsWith('.' + d)) domain = d; }
      if (key === 'max-age' && +v <= 0) dead = true;
      if (key === 'expires' && Date.parse(v) < Date.now()) dead = true;
    }
    if (!sess.jar.has(domain)) sess.jar.set(domain, new Map());
    dead ? sess.jar.get(domain).delete(name) : sess.jar.get(domain).set(name, value);
  }
}
function jarHeader(sess, host) {
  const out = [];
  for (const [d, m] of sess.jar) if (host === d || host.endsWith('.' + d)) for (const [k, v] of m) out.push(`${k}=${v}`);
  return out.join('; ');
}

/* ---------- safety: never let the proxy reach private networks ---------- */
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
  }
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::' || s.startsWith('fe80') || s.startsWith('fc') || s.startsWith('fd')) return true;
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  return m ? isPrivateIp(m[1]) : false;
}
async function assertPublic(hostname) {
  if (ALLOW_PRIVATE) return;
  const host = hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map(a => a.address);
  if (!ips.length || ips.some(isPrivateIp)) throw Object.assign(new Error('MAT does not open addresses on private networks.'), { code: 'PRIVATE' });
}

/* ---------- URL helpers ---------- */
function unwrapRedirector(u) {
  const h = u.hostname.replace(/^www\./, '');
  try {
    if (h === 'duckduckgo.com' && u.pathname === '/l/' && u.searchParams.get('uddg')) return new URL(u.searchParams.get('uddg'));
    if (/^google\.[a-z.]+$/.test(h) && u.pathname === '/url' && (u.searchParams.get('q') || u.searchParams.get('url'))) return new URL(u.searchParams.get('q') || u.searchParams.get('url'));
  } catch (e) { /* keep original */ }
  return u;
}
function stripParams(u, sess) {
  const del = [];
  u.searchParams.forEach((v, k) => { if (/^utm_/i.test(k) || BL.TRACK_PARAMS.includes(k.toLowerCase())) del.push(k); });
  if (del.length) { del.forEach(k => u.searchParams.delete(k)); sess.stats.stripped += del.length; }
}
function proxify(u, s, ctx) {
  u = unwrapRedirector(u);
  if (!/^https?:$/.test(u.protocol)) return u.href;
  const sess = ctx.sess;
  if (s.strip) stripParams(u, sess);
  if (s.adblock && BL.isBlocked(u)) { ctx.blocked++; return '/blocked?h=' + encodeURIComponent(u.hostname); }
  const hash = u.hash; u.hash = '';
  return '/proxy?u=' + encodeURIComponent(u.href) + hash;
}
function px(raw, base, ctx) {
  raw = raw.trim();
  if (!raw || /^(#|data:|blob:|javascript:|mailto:|tel:|about:|sms:)/i.test(raw)) return raw;
  let u; try { u = new URL(raw, base); } catch (e) { return raw; }
  if (!/^https?:$/.test(u.protocol)) return raw;
  return proxify(u, ctx.s, ctx);
}
const ent = v => v.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attr = v => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/* ---------- rewriting ---------- */
function rewriteCss(css, base, ctx) {
  return css
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, v) => { const n = px(v, base, ctx); return n === v ? m : `url("${n.replace(/"/g, '%22')}")`; })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (m, q, v) => `@import "${px(v, base, ctx)}"`);
}

function clientFn(BASE, BLOCKED, MOVIE) { // runs inside the page; stringified by the server
  var P = '/proxy?u=';
  function px(u) {
    try {
      if (u && typeof u !== 'string') u = u.href || String(u);
      if (typeof u !== 'string') return u;
      if (/^\/(proxy|blocked|matform)(\?|$)/.test(u) || /^(#|data:|blob:|javascript:|about:|mailto:|tel:)/i.test(u)) return u;
      var a = new URL(u, BASE);
      if (!/^https?:$/.test(a.protocol)) return u;
      return P + encodeURIComponent(a.href);
    } catch (e) { return u; }
  }
  function real(u) {
    try { var a = new URL(u, location.href); return a.pathname === '/proxy' ? a.searchParams.get('u') : a.href; } catch (e) { return u; }
  }
  var framed = window.parent !== window;
  function tell(type, extra) { if (!framed) return; var m = { mat: type }; for (var k in extra) m[k] = extra[k]; try { window.parent.postMessage(m, '*'); } catch (e) { /* ignore */ } }
  function report() { tell('page', { url: BASE, title: document.title || '', blocked: BLOCKED }); }
  function reportSearchBlock() {
    try {
      var host = new URL(BASE).hostname.replace(/^www\./, '');
      var text = (document.body && document.body.innerText || '').slice(0, 1000).toLowerCase();
      if (host === 'html.duckduckgo.com' && /if this persists|anonymized error code|email us/.test(text)) tell('searchblocked', { engine: 'duckduckgo', url: BASE });
    } catch (e) { /* ignore */ }
  }
  function movieState(v, action) { tell('movie', { url: BASE, action: action, time: Number(v.currentTime) || 0, playing: !v.paused }); }
  function movieAssistant() {
    if (!MOVIE) return;
    var approved = false, offered = false, nextTimer = null, lastCue = '';
    var style = document.createElement('style');
    style.textContent = '#mat-movie-tools{position:fixed;z-index:2147483647;right:14px;bottom:14px;display:flex;gap:8px;align-items:center;padding:9px 11px;border-radius:12px;background:rgba(13,16,21,.94);color:#fff;font:13px system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35)}#mat-movie-tools button{border:1px solid #6474ff;background:#2b47f5;color:#fff;border-radius:8px;padding:7px 10px;font:inherit;cursor:pointer}#mat-movie-tools button.secondary{background:transparent;border-color:#6d7786}#mat-movie-tools[hidden]{display:none}';
    (document.head || document.documentElement).appendChild(style);
    var box = document.createElement('div'); box.id = 'mat-movie-tools'; box.hidden = true; document.documentElement.appendChild(box);
    function hide(){box.hidden=true;box.innerHTML='';}
    function showCue(video, label){
      if (lastCue === label) return; lastCue = label;
      var outro=label==='outro', amount=outro?Math.max(0,(video.duration||0)-1):video.currentTime+90;
      var action=outro?'Skip outro':(label==='intro'?'Skip intro':'Skip segment');
      box.hidden=false; box.innerHTML='<span>Possible '+label+' detected</span><button data-skip>'+action+'</button><button class="secondary" data-dismiss>Dismiss</button>';
      box.querySelector('[data-skip]').onclick=function(){video.currentTime=outro?amount:Math.min((video.duration||amount),amount);hide()};
      box.querySelector('[data-dismiss]').onclick=hide;
    }
    function findNext(){
      var els=document.querySelectorAll('button,a,[role="button"]');
      for(var i=0;i<els.length;i++){var t=(els[i].innerText||els[i].getAttribute('aria-label')||'').trim();if(/^(next|next episode|continue|play next)$/i.test(t))return els[i]}
      return null;
    }
    function armNext(video){
      if(!approved||nextTimer)return;
      var next=findNext(); if(!next)return;
      var left=10; box.hidden=false; box.innerHTML='<span>Next episode in <b>'+left+'</b>s</span><button data-cancel class="secondary">Cancel</button>';
      var tick=setInterval(function(){left--;var b=box.querySelector('b');if(b)b.textContent=left;if(left<=0){clearInterval(tick);nextTimer=null;hide();next.click()}},1000); nextTimer=tick;
      box.querySelector('[data-cancel]').onclick=function(){clearInterval(tick);nextTimer=null;hide()};
    }
    function scan(){
      var videos=document.querySelectorAll('video');
      for(var i=0;i<videos.length;i++){
        var v=videos[i]; if(v.__matMovieBound)continue; v.__matMovieBound=true;
        v.preload='auto'; v.setAttribute('playsinline','');
        var tracks=v.textTracks||[]; for(var ti=0;ti<tracks.length;ti++) if(/^en(?:-|$)/i.test(tracks[ti].language||tracks[ti].srclang||'')) tracks[ti].mode='showing';
        v.addEventListener('waiting',function(){
          var buffered=0; try{buffered=Math.max(0,this.buffered.end(this.buffered.length-1)-this.currentTime)}catch(e){}
          box.hidden=false; box.innerHTML='<span>Buffering'+(buffered?' · '+Math.round(buffered)+'s ready':'')+'…</span><button data-retry>Retry</button>';
          var video=this, pos=this.currentTime; box.querySelector('[data-retry]').onclick=function(){try{video.load();video.currentTime=pos;video.play().catch(function(){})}catch(e){} hide()};
        });
        v.addEventListener('stalled',function(){
          if(box.hidden){box.hidden=false;box.innerHTML='<span>Connection stalled</span><button data-retry>Retry from here</button><button class="secondary" data-dismiss>Dismiss</button>';var video=this,pos=this.currentTime;box.querySelector('[data-retry]').onclick=function(){try{video.load();video.currentTime=pos;video.play().catch(function(){})}catch(e){}hide()};box.querySelector('[data-dismiss]').onclick=hide}
        });
        v.addEventListener('canplay',function(){if(/^Buffering|^Connection stalled/.test(box.textContent))hide()});
        v.addEventListener('timeupdate',function(){if(this.duration>60&&this.currentTime>10&&Math.floor(this.currentTime)%10===0){try{localStorage.setItem('mat.resume.'+BASE,JSON.stringify({time:this.currentTime,duration:this.duration,at:Date.now()}))}catch(e){}}});
        v.addEventListener('loadedmetadata',function(){
          try{var saved=JSON.parse(localStorage.getItem('mat.resume.'+BASE)||'null');if(saved&&saved.time>30&&saved.time<this.duration-15&&Date.now()-saved.at<1209600000){box.hidden=false;box.innerHTML='<span>Resume at '+Math.floor(saved.time/60)+':'+String(Math.floor(saved.time%60)).padStart(2,'0')+'?</span><button data-resume>Resume</button><button class="secondary" data-start>Start over</button>';box.querySelector('[data-resume]').onclick=function(){this.currentTime=saved.time;hide()}.bind(this);box.querySelector('[data-start]').onclick=function(){try{localStorage.removeItem('mat.resume.'+BASE)}catch(e){}hide()}}}catch(e){}
        });
        v.addEventListener('ended',function(){armNext(this)});
        v.addEventListener('play',function(){movieState(this,'play')}); v.addEventListener('pause',function(){movieState(this,'pause')}); v.addEventListener('seeked',function(){movieState(this,'seek')});
        var text=(document.body.innerText||'').slice(0,12000);
        var cue=/previously on|recap|episode recap/i.test(text)?'recap':/opening credits|intro|opening theme/i.test(text)?'intro':/end credits|closing credits|outro|the end/i.test(text)?'outro':/song|music video|musical number/i.test(text)?'song':null;
        if(cue&&((cue==='outro'&&v.duration&&v.currentTime>Math.max(0,v.duration-180))||(cue!=='outro'&&v.currentTime<30)))showCue(v,cue);
      }
      if(videos.length&&!approved&&!offered&&box.hidden){
        offered=true; box.hidden=false; box.innerHTML='<span>Movie Mode ready</span><button data-auto>Enable 10s auto-next</button>'+(document.pictureInPictureEnabled?'<button class="secondary" data-pip>PiP</button>':'')+'<button class="secondary" data-full>Fullscreen</button><button class="secondary" data-dismiss>Not now</button>';
        box.querySelector('[data-auto]').onclick=function(){approved=true;hide()}; box.querySelector('[data-dismiss]').onclick=hide;
        if(box.querySelector('[data-pip]'))box.querySelector('[data-pip]').onclick=function(){var v=videos[0];if(v.requestPictureInPicture)v.requestPictureInPicture().catch(function(){})};
        if(box.querySelector('[data-full]'))box.querySelector('[data-full]').onclick=function(){var v=videos[0];if(v.requestFullscreen)v.requestFullscreen().catch(function(){})};
      }
      if(!approved&&!box.hidden&&box.querySelector('[data-skip]')){
        var toggle=document.createElement('button');toggle.className='secondary';toggle.textContent='Allow auto-next';toggle.onclick=function(){approved=true;toggle.remove()};box.appendChild(toggle);
      }
    }
    setInterval(scan,1500); scan();
    window.addEventListener('message',function(e){var d=e.data||{};if(d.mat!=='moviecmd')return;var v=document.querySelector('video');if(!v)return;try{if(typeof d.time==='number')v.currentTime=d.time;if(d.action==='play')v.play().catch(function(){});if(d.action==='pause')v.pause()}catch(x){}});
  }

  var of = window.fetch;
  if (of) window.fetch = function (i, o) {
    try { if (typeof i === 'string' || i instanceof URL) i = px(String(i)); else if (i && i.url) i = new Request(px(i.url), i); } catch (e) { /* ignore */ }
    return of.call(this, i, o);
  };
  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { arguments[1] = px(u); return xo.apply(this, arguments); };
  var sa = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) {
    if (typeof n === 'string' && /^(src|href|action|poster)$/i.test(n) && typeof v === 'string') v = px(v);
    return sa.call(this, n, v);
  };
  [[HTMLScriptElement, 'src'], [HTMLImageElement, 'src'], [HTMLIFrameElement, 'src'], [HTMLSourceElement, 'src'], [HTMLMediaElement, 'src'], [HTMLLinkElement, 'href'], [HTMLAnchorElement, 'href'], [HTMLFormElement, 'action']].forEach(function (p) {
    try {
      var d = Object.getOwnPropertyDescriptor(p[0].prototype, p[1]);
      if (d && d.set) Object.defineProperty(p[0].prototype, p[1], { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, px(v)); } });
    } catch (e) { /* ignore */ }
  });
  // Video sites frequently create pop-under windows. In Movie Mode those windows
  // are discarded; outside Movie Mode, legitimate new windows become MAT tabs.
  window.open = function (u) {
    if (MOVIE) return null;
    if (u) tell('open', { url: new URL(real(px(String(u))), BASE).href });
    return null;
  };
  // Prevent script-created meta refresh redirects. Regular links and form submits
  // still work, and server-side redirects are screened by the block list.
  var metaAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function (node) {
    if (MOVIE && node && node.tagName === 'META' && /^refresh$/i.test(node.httpEquiv || '')) return node;
    return metaAppend.call(this, node);
  };
  ['pushState', 'replaceState'].forEach(function (n) {
    var o = history[n];
    history[n] = function (s, t, u) {
      if (u != null) { try { BASE = new URL(String(u), BASE).href; } catch (e) { /* ignore */ } u = undefined; }
      var r = o.call(this, s, t); report(); return r;
    };
  });
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (a && (a.target === '_blank' || a.target === '_top' || a.target === '_parent') && e.button === 0) {
      e.preventDefault(); tell('open', { url: real(a.href) });
    }
  }, true);
  document.addEventListener('submit', function (e) { if (e.target && e.target.target && e.target.target !== '_self') e.target.target = '_self'; }, true);
  document.addEventListener('keydown', function (e) { if (e.altKey && /^(t|w|l)$/i.test(e.key)) tell('key', { key: e.key.toLowerCase() }); }, true);
  document.addEventListener('DOMContentLoaded', function () { report(); reportSearchBlock(); });
  window.addEventListener('load', function () { report(); reportSearchBlock(); });
  if (MOVIE) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', movieAssistant); else movieAssistant(); }
  new MutationObserver(function () { var t = document.querySelector('title'); if (t) report(); }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
}

function injection(base, ctx) {
  const s = ctx.s;
  const movieCss = s.movie ? '[class*="popup" i],[id*="popup" i],[class*="popunder" i],[id*="popunder" i],[class*="overlay" i][style*="position: fixed" i],[id*="overlay" i][style*="position: fixed" i],[class*="modal" i][style*="position: fixed" i],[id*="modal" i][style*="position: fixed" i],[class*="banner-ad" i],[id*="banner-ad" i]{display:none!important}body{overflow:auto!important}' : '';
  const css = (s.adblock ? BL.COSMETIC : '') + movieCss + (s.dark ? 'html{filter:invert(1) hue-rotate(180deg);background:#fff}img,video,picture,canvas,iframe,svg image,[style*="background-image"]{filter:invert(1) hue-rotate(180deg)}' : '');
  const js = `(${clientFn.toString()})(${JSON.stringify(base).replace(/</g, '\\u003c')},${ctx.blocked},${s.movie ? 'true' : 'false'})`;
  return (css ? `<style>${css}</style>` : '') + `<script>${js}</script>`;
}

function rewriteHtml(html, pageUrl, ctx) {
  const s = ctx.s;
  let base = pageUrl;
  const bm = /<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/i.exec(html);
  if (bm) { try { base = new URL(ent(bm[1] || bm[2]), pageUrl).href; } catch (e) { /* ignore */ } }
  html = html.replace(/<base\b[^>]*>/gi, '');
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?(content-security-policy|x-frame-options)[^>]*>/gi, '');
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, tag =>
    tag.replace(/(url\s*=\s*['"]?)([^'">]+)/i, (m, pre, v) => pre + px(ent(v), base, ctx)));

  if (s.nojs) {
    html = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<\/?noscript\b[^>]*>/gi, '');
    html = html.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
  }

  // drop ad and tracker elements before anything is rewritten
  const srcOf = tag => { const m = /\b(?:src|href|data)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag); return m ? ent(m[1] || m[2] || '') : ''; };
  const blocked = tag => {
    if (!s.adblock) return false;
    const v = srcOf(tag); if (!v) return false;
    try { const u = new URL(v, base); return /^https?:$/.test(u.protocol) && BL.isBlocked(u); } catch (e) { return false; }
  };
  if (s.adblock) {
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => blocked(tag) ? (ctx.blocked++, '') : tag);
    html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, tag => blocked(tag) ? (ctx.blocked++, '') : tag);
    html = html.replace(/<(img|link|embed|source|track|object)\b[^>]*>/gi, tag => blocked(tag) ? (ctx.blocked++, '') : tag);
  }

  html = html.replace(/\s(?:integrity|nonce)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
  html = html.replace(/(\s(?:href|src|action|poster|formaction|data-src|data-href)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (m, pre, a, b) => {
    const v = a !== undefined ? a : b, n = px(ent(v), base, ctx);
    return n === ent(v) ? m : pre + '"' + attr(n) + '"';
  });
  html = html.replace(/(\s(?:srcset|imagesrcset|data-srcset)\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (m, pre, a, b) => {
    const list = ent(a !== undefined ? a : b).split(',').map(x => x.trim()).filter(Boolean).map(item => {
      const i = item.search(/\s/), u = i < 0 ? item : item.slice(0, i), rest = i < 0 ? '' : item.slice(i);
      return px(u, base, ctx) + rest;
    });
    return pre + '"' + attr(list.join(', ')) + '"';
  });
  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, a, css, c) => a + rewriteCss(css, base, ctx) + c);
  html = html.replace(/(\sstyle\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi, (m, pre, a, b) => pre + '"' + attr(rewriteCss(ent(a !== undefined ? a : b), base, ctx)) + '"');

  // GET forms drop the query part of their action, so route them through /matform
  html = html.replace(/<form\b[^>]*>/gi, tag => {
    const method = (/\bmethod\s*=\s*["']?(\w+)/i.exec(tag) || [])[1] || 'get';
    if (/^post$/i.test(method)) return tag;
    const am = /\saction\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    let real;
    if (am) {
      const val = ent(am[1] !== undefined ? am[1] : am[2]);
      const um = /^\/proxy\?u=([^#]*)/.exec(val);
      if (!um) return tag;
      real = decodeURIComponent(um[1]);
      tag = tag.replace(am[0], ' action="/matform"');
    } else {
      real = base; tag = tag.replace(/<form\b/i, '<form action="/matform"');
    }
    return tag + `<input type="hidden" name="__mat_u" value="${attr(real)}">`;
  });

  const inj = injection(base, ctx);
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, m => m + inj) : inj + html;
}

/* ---------- pages shown by MAT itself ---------- */
function shell(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>:root{color-scheme:light dark}body{font:15px/1.55 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#eceff3;color:#13171d}
@media(prefers-color-scheme:dark){body{background:#0d1015;color:#e6eaf0}code{background:#212a35}}
main{max-width:560px;padding:24px}h1{font-size:26px;margin:0 0 8px;letter-spacing:-.01em}p{margin:8px 0;color:#566170}code{background:#dce1e8;padding:2px 6px;border-radius:5px;word-break:break-all}
.tag{font:600 11px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase;color:#c2322a}a{color:#2b47f5}</style><main>${body}</main>`;
}
const errorPage = (title, msg, url) => shell(title, `<div class="tag">MAT Browser</div><h1>${title}</h1><p>${msg}</p>${url ? `<p><code>${url.replace(/[<>&]/g, '')}</code></p>` : ''}`);

/* ---------- request plumbing ---------- */
function send(res, code, type, body, extra) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra }); res.end(body); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function decodeText(buf, ct) {
  let cs = (/charset=([\w-]+)/i.exec(ct) || [])[1];
  if (!cs) cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1')) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch (e) { return buf.toString('utf8'); }
}
const isNav = req => /^(document|iframe|frame)$/.test(req.headers['sec-fetch-dest'] || 'document');

async function upstream(u, sess, req, body, tryHttps) {
  const headers = {
    'user-agent': UA,
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'en-US,en;q=0.9',
    referer: u.origin + '/'
  };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers.range) headers.range = req.headers.range;
  if (sess.s.cookies) { const c = jarHeader(sess, u.hostname); if (c) headers.cookie = c; }
  await assertPublic(u.hostname);
  return fetch(u, { method: req.method, headers, body: body && body.length ? body : undefined, redirect: 'manual', signal: AbortSignal.timeout(30000) });
}

async function handleProxy(req, res) {
  const sess = getSession(req, res, false);
  const q = new URL(req.url, 'http://x');
  let u;
  try { u = new URL(q.searchParams.get('u')); } catch (e) { return send(res, 400, 'text/html; charset=utf-8', errorPage('That address is not valid', 'Check the spelling and try again.')); }
  if (!/^https?:$/.test(u.protocol)) return send(res, 400, 'text/html; charset=utf-8', errorPage('Unsupported address', 'MAT opens http and https addresses.', u.href));
  u = unwrapRedirector(u);
  if (sess.s.adblock && BL.isBlocked(u)) return blocked(req, res, sess, u.hostname);

  const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req);
  let r, upgraded = false;
  try {
    const plain = u.protocol === 'http:' && !net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && u.hostname !== 'localhost';
    if (sess.s.https && plain) {
      try { const h = new URL(u.href); h.protocol = 'https:'; r = await upstream(h, sess, req, body); u = h; upgraded = true; sess.stats.upgraded++; }
      catch (e) { if (e.code === 'PRIVATE') throw e; r = null; }
    }
    if (!r) {
      try { r = await upstream(u, sess, req, body); }
      catch (e) {
        // A single bounded retry helps transient DNS/TCP failures without
        // duplicating POST requests or creating an unbounded proxy loop.
        if (req.method !== 'GET' && req.method !== 'HEAD') throw e;
        await new Promise(resolve => setTimeout(resolve, 250));
        r = await upstream(u, sess, req, body);
      }
    }
  } catch (e) {
    const private_ = e.code === 'PRIVATE';
    if (!isNav(req)) return send(res, 502, 'text/plain', 'MAT could not load this.');
    return send(res, private_ ? 403 : 502, 'text/html; charset=utf-8', errorPage(private_ ? 'Blocked for your safety' : 'This site did not respond',
      private_ ? e.message : 'MAT could not reach it. The address may be wrong, or the site may be down or refusing connections.', u.href));
  }

  const setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  if (sess.s.cookies && setCookies.length) jarStore(sess, u.hostname, setCookies);

  const ctx = { sess, s: sess.s, blocked: 0 };
  if ([301, 302, 303, 307, 308].includes(r.status) && r.headers.get('location')) {
    let loc; try { loc = new URL(r.headers.get('location'), u); } catch (e) { return send(res, 502, 'text/plain', 'Bad redirect'); }
    return send(res, r.status, 'text/plain', '', { Location: proxify(loc, sess.s, ctx) });
  }

  const ct = r.headers.get('content-type') || '';
  if (/text\/html|application\/xhtml/i.test(ct)) {
    const html = rewriteHtml(decodeText(Buffer.from(await r.arrayBuffer()), ct), u.href, ctx);
    sess.stats.blocked += ctx.blocked;
    return send(res, r.status, 'text/html; charset=utf-8', html);
  }
  if (/text\/css/i.test(ct)) {
    return send(res, r.status, 'text/css; charset=utf-8', rewriteCss(decodeText(Buffer.from(await r.arrayBuffer()), ct), u.href, ctx), { 'Cache-Control': 'private, max-age=300' });
  }
  const out = { 'Content-Type': ct || 'application/octet-stream' };
  for (const h of ['content-disposition', 'accept-ranges', 'content-range', 'cache-control', 'etag', 'last-modified']) { const v = r.headers.get(h); if (v) out[h] = v; }
  res.writeHead(r.status, out);
  if (req.method === 'HEAD' || !r.body) return res.end();
  Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
}

function blocked(req, res, sess, host) {
  sess.stats.blocked++;
  if (isNav(req)) return send(res, 200, 'text/html; charset=utf-8', errorPage('Blocked by Shield', `MAT stopped a request to <code>${String(host).replace(/[<>&]/g, '')}</code> because it is on the ad and tracker list. Turn off ad blocking in the Shield menu to open it.`));
  const ct = (req.headers['sec-fetch-dest'] || '') === 'script' ? 'text/javascript' : 'text/plain';
  return send(res, 204, ct, '');
}

async function handleForm(req, res) {
  const sess = getSession(req, res, false);
  const q = new URL(req.url, 'http://x');
  const body = req.method === 'POST' ? new URLSearchParams((await readBody(req)).toString()) : q.searchParams;
  let target; try { target = new URL(body.get('__mat_u')); } catch (e) { return send(res, 400, 'text/plain', 'Bad form'); }
  body.delete('__mat_u');
  target.search = body.toString();
  send(res, 303, 'text/plain', '', { Location: proxify(target, sess.s, { sess, s: sess.s, blocked: 0 }) });
}

/* ---------- the browser window and its small API ---------- */
const PUB = path.join(__dirname, 'public');
async function handleMain(req, res) {
  const q = new URL(req.url, 'http://x');
  const sess = getSession(req, res, true);
  if (q.pathname === '/' || q.pathname === '/index.html') return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.join(PUB, 'index.html')));
  if (req.method === 'GET' && (/^\/manifest\.webmanifest$/.test(q.pathname) || /^\/sw\.js$/.test(q.pathname) || /^\/icons\/[a-z0-9-]+\.svg$/i.test(q.pathname))) {
    const file = path.join(PUB, q.pathname.replace(/^\//, ''));
    if (file.startsWith(PUB) && fs.existsSync(file)) {
      const type = q.pathname.endsWith('.svg') ? 'image/svg+xml' : q.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/manifest+json';
      return send(res, 200, type, fs.readFileSync(file));
    }
  }
  if (q.pathname === '/api/config') return send(res, 200, 'application/json', JSON.stringify({ contentOrigin: CONTENT_ORIGIN, contentPort: process.env.VERCEL ? 0 : CPORT, settings: sess.s }));
  if (q.pathname === '/api/health') return send(res, 200, 'application/json', JSON.stringify({ ok: true, runtime: process.env.VERCEL ? 'vercel' : 'node', node: process.versions.node, parties: parties.size }));
  if (q.pathname === '/api/party/create' && (req.method === 'POST' || req.method === 'GET')) {
    try {
      const id = crypto.randomBytes(12).toString('hex'); parties.set(id, { state: null, touched: Date.now() });
      return send(res, 201, 'application/json', JSON.stringify({ id }));
    } catch (e) { return send(res, 500, 'application/json', JSON.stringify({ error: 'party_create_failed', message: e.message })); }
  }
  if (q.pathname === '/api/party/state') {
    const id = q.searchParams.get('room') || '';
    if (!parties.has(id)) return send(res, 404, 'application/json', '{"error":"room_not_found"}');
    const room = parties.get(id); room.touched = Date.now();
    if (req.method === 'POST') { try { const d = JSON.parse((await readBody(req)).toString()); if (d && typeof d === 'object') room.state = { source: String(d.source || '').slice(0, 80), url: String(d.url || ''), action: String(d.action || ''), time: Number(d.time) || 0, playing: !!d.playing, at: Date.now() }; } catch (e) { return send(res, 400, 'application/json', '{"error":"bad_state"}'); } }
    return send(res, 200, 'application/json', JSON.stringify(room.state || {}));
  }
  if (q.pathname === '/api/settings' && req.method === 'POST') {
    try {
      const d = JSON.parse((await readBody(req)).toString());
      for (const k of Object.keys(DEFAULTS)) if (typeof d[k] === 'boolean') sess.s[k] = d[k];
    } catch (e) { return send(res, 400, 'application/json', '{"error":"bad settings"}'); }
    return send(res, 200, 'application/json', JSON.stringify(sess.s));
  }
  if (q.pathname === '/api/stats') return send(res, 200, 'application/json', JSON.stringify(sess.stats));
  if (q.pathname === '/api/clearcookies' && req.method === 'POST') { sess.jar.clear(); return send(res, 200, 'application/json', '{"ok":true}'); }
  if (q.pathname === '/api/suggest') {
    const term = (q.searchParams.get('q') || '').slice(0, 200);
    if (!term) return send(res, 200, 'application/json', '[]');
    try {
      const r = await fetch('https://duckduckgo.com/ac/?type=list&q=' + encodeURIComponent(term), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      return send(res, 200, 'application/json', JSON.stringify(Array.isArray(d[1]) ? d[1].slice(0, 6) : []));
    } catch (e) { return send(res, 200, 'application/json', '[]'); }
  }
  send(res, 404, 'text/plain', 'Not found');
}

const wrap = fn => (req, res) => fn(req, res).catch(e => { if (!res.headersSent) send(res, 500, 'text/plain', 'MAT hit an error: ' + e.message); else res.destroy(); });
const handleContent = wrap(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/proxy') return handleProxy(req, res);
  if (p === '/matform') return handleForm(req, res);
  if (p === '/blocked') return blocked(req, res, getSession(req, res, false), new URL(req.url, 'http://x').searchParams.get('h') || 'this host');
  if (p === '/favicon.ico') return send(res, 204, 'image/x-icon', '');
  send(res, 404, 'text/plain', 'Not found');
});
const handleMainRequest = wrap(handleMain);
setInterval(() => { const cutoff = Date.now() - 2 * 60 * 60 * 1000; for (const [id, room] of parties) if (room.touched < cutoff) parties.delete(id); }, 15 * 60 * 1000).unref();
if (require.main === module) {
  http.createServer(handleMainRequest).listen(PORT, HOST, () => console.log(`MAT Browser is running at http://${HOST}:${PORT}`));
  http.createServer(handleContent).listen(CPORT, HOST, () => console.log(`Pages are served from port ${CPORT}`));
}
module.exports = { handleMain: handleMainRequest, handleContent };

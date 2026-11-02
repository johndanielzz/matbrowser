'use strict';
// Hosts whose requests MAT never makes. A request to the host or any subdomain is blocked.
const HOSTS = ['doubleclick.net','googlesyndication.com','googleadservices.com','adservice.google.com','google-analytics.com','googletagmanager.com','googletagservices.com','pagead2.googlesyndication.com','facebook.net','connect.facebook.net','ads.twitter.com','analytics.twitter.com','static.ads-twitter.com','ads.linkedin.com','ads.tiktok.com','analytics.tiktok.com','taboola.com','outbrain.com','criteo.com','criteo.net','adnxs.com','rubiconproject.com','pubmatic.com','openx.net','casalemedia.com','amazon-adsystem.com','scorecardresearch.com','quantserve.com','hotjar.com','mixpanel.com','segment.io','segment.com','fullstory.com','mouseflow.com','crazyegg.com','adroll.com','moatads.com','2mdn.net','serving-sys.com','bidswitch.net','smartadserver.com','media.net','revcontent.com','zedo.com','popads.net','propellerads.com','adsterra.com','exoclick.com','yieldmo.com','sharethrough.com','tapad.com','demdex.net','bluekai.com','krxd.net','chartbeat.net','newrelic.com','nr-data.net','branch.io','app-measurement.com','adsrvr.org','adform.net','advertising.com','everesttech.net','mathtag.com','turn.com','contextweb.com','lijit.com','sovrn.com','33across.com','indexww.com','gumgum.com','teads.tv','adsafeprotected.com','doubleverify.com','imrworldwide.com','omtrdc.net','2o7.net','optimizely.com','mookie1.com','yimg.com/ads','ads.yahoo.com','analytics.yahoo.com','bat.bing.com','clarity.ms','px.ads.linkedin.com','snap.licdn.com','sc-static.net','tr.snapchat.com','ct.pinterest.com','log.pinterest.com','cdn.mxpnl.com','api.amplitude.com','cdn.heapanalytics.com','heap.io','intercom.io','drift.com','pardot.com','hubspot.com/__ptq.gif','track.hubspot.com','hs-analytics.net','hsadspixel.net','ads.reddit.com','events.redditmedia.com','pixel.quantserve.com','sb.scorecardresearch.com','adthrive.com','mediavine.com','ezoic.net','ezodn.com','monetizemore.com','infolinks.com','adblade.com','content.ad','mgid.com','nativo.com','triplelift.com','kargo.com','undertone.com','connatix.com','springserve.com','freewheel.tv','adition.com','adscale.de','yandex.ru/ads','an.yandex.ru','mc.yandex.ru'].filter(h => !h.includes('/'));

// Hostnames starting with these labels are treated as ad or tracking servers.
const HOST_PREFIX = /^(ads?|adserver|adservice|adtech|adsystem|pixel|track|tracking|telemetry|beacon|metrics)\d*\./i;

// Paths that serve ads.
const PATHS = /\/(pagead|adserver|adframe|ad-banner|adsbygoogle|doubleclick|googleads)\b|\/ads?\/(?:js|banner|serve|show)|[?&]adunit=/i;

const TRACK_PARAMS = ['fbclid','gclid','dclid','gbraid','wbraid','msclkid','yclid','twclid','igshid','mc_eid','mc_cid','_hsenc','_hsmi','mkt_tok','vero_id','oly_enc_id','oly_anon_id','spm','ref_src','ref_url','s_cid','trk','trkid','__s','_ga','_gl','gad_source','ttclid','li_fat_id'];

// Hides ad containers that survive request blocking.
const COSMETIC = 'ins.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[id*="taboola"],[id*="outbrain"],[class*="adsbygoogle"],[class~="ad-banner"],[class~="ad-slot"],[class~="ad-container"],[class~="advert"],[class~="advertisement"],[class~="sponsored-ad"],[data-ad-slot],[data-google-query-id],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],a[href*="doubleclick.net"]{display:none!important}';

function isBlockedHost(host) {
  host = String(host).toLowerCase().replace(/^www\./, '').replace(/^\[|\]$/g, '');
  if (HOST_PREFIX.test(host)) return true;
  for (const d of HOSTS) if (host === d || host.endsWith('.' + d)) return true;
  return false;
}
function isBlocked(url) { return isBlockedHost(url.hostname) || PATHS.test(url.pathname + url.search); }

module.exports = { HOSTS, TRACK_PARAMS, COSMETIC, isBlocked, isBlockedHost };

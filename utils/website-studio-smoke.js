import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePublishedWebsiteHtml } from "../server/utils/websiteHtml.js";
import { WebsiteService } from "../server/services/websiteService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function assertSafePublishedHtml(html) {
  assert.match(html, /src="\/js\/website-runtime\.js"/);
  assert.doesNotMatch(html, /<iframe\b|\bon\w+\s*=|javascript\s*:/i);
}

const unsafeDraft = `<!doctype html><html><head><style>@import url(https://bad.example/x.css);body{color:red}</style></head><body><a href="javascript:alert(1)" onclick="alert(2)">Unsafe</a><img src="data:image/png;base64,AA=="><iframe src="https://bad.example"></iframe><script>alert(3)</script></body></html>`;
const guardedDraft = preparePublishedWebsiteHtml(unsafeDraft);
assertSafePublishedHtml(guardedDraft);
assert.match(guardedDraft, /data:image\/png/i);
assert.doesNotMatch(guardedDraft, /@import|alert\(3\)/i);

const service = new WebsiteService();
service.pollinations = {
  async buildWebsite() {
    return {
      provider: "smoke",
      model: "smoke",
      pageCount: 1,
      html: `<!doctype html><html><head><title>Studio Smoke Business</title></head><body><nav class="nav"><a class="nav-a" href="#pg-0" onclick="ignored()">Home</a></nav><section class="pg" id="pg-0"><h1>Studio Smoke Business</h1><p>This test verifies the published website path retains useful content while removing executable output from an AI or manual draft.</p><p>Visitors can review a clear service description, choose a relevant action, and use the available contact form without a false claim that the message has been delivered.</p><p>The published page includes semantic sections, a descriptive title, useful supporting copy, and a safe first-party navigation runtime for multiple generated page sections.</p><p>It is intentionally long enough to prove the service accepts readable website content rather than a style-only or empty AI response.</p><form><input><button>Send</button></form></section><script>ignored()</script></body></html>`,
    };
  },
};
service.nvidia = { configured: () => false };
const user = { uid: "website-studio-smoke" };
const built = await service.build({ lead: { name: "Studio Smoke Business" }, options: { businessName: "Studio Smoke Business", pages: 1 }, user });
assertSafePublishedHtml(built.website.html);
const saved = await service.saveHtml(built.website.id, unsafeDraft, user);
assertSafePublishedHtml(saved.website.html);
assert.ok(await service.getByToken(built.website.shareToken));

const [studioHtml, editorHtml, studioJs, editorJs, nativeApp] = await Promise.all([
  read("website-studio.html"),
  read("website-editor.html"),
  read("js/website-studio.js"),
  read("js/website-editor.js"),
  read("server/nativeApp.js"),
]);
assert.match(studioHtml, /id="wsxBuildBrief"/);
assert.match(studioHtml, /id="studioQuality"/);
assert.match(studioJs, /targetAudience/);
assert.match(editorHtml, /id="wedPreviewFrame"/);
assert.match(editorHtml, /id="wedAiApply"/);
assert.doesNotMatch(editorHtml, /<iframe id="wedPreview"/);
assert.match(editorJs, /wedPreviewFrame/);
assert.match(nativeApp, /script-src 'self'; style-src 'self' 'unsafe-inline'/);

console.log("Website Studio and Editor smoke checks passed.");

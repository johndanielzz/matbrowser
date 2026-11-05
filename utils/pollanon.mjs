import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(".env", "utf8");
const key = (envText.match(/^POLLINATIONS_API_KEY=(.*)$/m)?.[1] || "").trim().replace(/^["']|["']$/g, "");
const out = process.argv[2] || "logs/_anon.txt";
const lines = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "https://gen.pollinations.ai";

async function probe(label, url, headers = {}) {
  const started = Date.now();
  try {
    const r = await fetch(url, { headers });
    const ct = r.headers.get("content-type") || "";
    let info;
    if (ct.includes("json")) info = (await r.text()).slice(0, 300);
    else { const b = await r.arrayBuffer(); info = "bytes=" + b.byteLength + " ct=" + ct; }
    lines.push(label.padEnd(44) + " HTTP " + String(r.status).padEnd(4) + (Date.now() - started + "ms").padEnd(8) + info);
  } catch (e) {
    lines.push(label.padEnd(44) + " ERR " + e.message);
  }
  await sleep(800);
}

// Anonymous image (no key at all)
await probe("IMG anon flux.1-schnell", base + "/image/a%20red%20fox?model=black-forest-labs/flux.1-schnell&width=512&height=512&nologo=true");
await probe("IMG anon default", base + "/image/a%20red%20fox?width=512&height=512&nologo=true");
await probe("IMG anon z-image-turbo", base + "/image/a%20red%20fox?model=tongyi-mai/z-image-turbo&width=512&height=512&nologo=true");
await probe("IMG anon flux", base + "/image/a%20red%20fox?model=flux&width=512&height=512&nologo=true");
await probe("IMG anon kontext", base + "/image/a%20red%20fox?model=kontext&width=512&height=512&nologo=true");

// key in query vs header for image
await probe("IMG hdr-auth default", base + "/image/a%20red%20fox?model=tongyi-mai/z-image-turbo&width=512&height=512&nologo=true", { Authorization: "Bearer " + key });

// Anonymous text
await probe("TXT anon glm", base + "/v1/chat/completions", { "Content-Type": "application/json" });

writeFileSync(out, lines.join("\n"), "utf8");
console.log("wrote " + out);

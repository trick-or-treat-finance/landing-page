// Typewriter section shots: 375 and 1280, light and dark, mid-typing and finished.
// Usage: npm run build && node scripts/typewriter-shots.mjs [outDir]
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const dist = resolve("dist");
const outDir = resolve(process.argv[2] ?? "shots/typewriter");
mkdirSync(outDir, { recursive: true });
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = createServer((req, res) => {
  const f = join(dist, req.url.split(/[?#]/)[0].replace("/landing-page", "").replace(/\/$/, "/index.html"));
  if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const scheme of ["light", "dark"])
  for (const w of [375, 1280]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(`${base}/landing-page/index.html`, { waitUntil: "networkidle" });
    const region = page.locator(".duo-quotes");
    await region.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector(".duo-quotes").scrollIntoView({ block: "center" }));
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 150, null, { timeout: 30000 });
    const clip = async (name) => {
      const box = await page.evaluate(() => { const r = document.querySelector(".duo-quotes").getBoundingClientRect(); const n = document.querySelector(".duo-note").getBoundingClientRect(); return { y: Math.max(0, r.top - 16 + scrollY), h: n.bottom - r.top + 32 }; });
      await page.screenshot({ path: join(outDir, `${name}-${scheme}-${w}.png`), fullPage: true, clip: { x: 0, y: box.y, width: w, height: box.h } });
    };
    await clip("mid");
    await page.waitForFunction(() => !document.querySelector(".tw-layer"), null, { timeout: 60000 });
    await clip("done");
    await ctx.close();
  }
await browser.close();
server.close();

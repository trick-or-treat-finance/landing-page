// Top-of-page and full-page shots, four widths, light and dark.
// Usage: npm run build && CHROMIUM_PATH=... node scripts/duo-shots.mjs [outDir]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const dist = resolve("dist");
const outDir = resolve(process.argv[2] ?? "shots");
mkdirSync(outDir, { recursive: true });
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = createServer((req, res) => {
  const f = join(dist, req.url.split(/[?#]/)[0].replace("/landing-page", "").replace(/\/$/, "/index.html"));
  if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/landing-page/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const scheme of ["light", "dark"])
  for (const w of [375, 768, 1280, 1920]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1000 }, colorScheme: scheme });
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(outDir, `top-${scheme}-${w}.png`) });
    await page.screenshot({ path: join(outDir, `full-${scheme}-${w}.png`), fullPage: true });
    await page.close();
  }
await browser.close();
server.close();

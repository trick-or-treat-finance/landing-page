// Full-page screenshots of both pages at 375/768/1280/1920.
// Usage: npm run build && node scripts/screenshots.mjs [outDir]
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const dist = resolve("dist");
const outDir = resolve(process.argv[2] ?? "shots");
mkdirSync(outDir, { recursive: true });
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = createServer((req, res) => {
  const f = join(dist, req.url.split(/[?#]/)[0].replace("/landing-page", "").replace(/\/$/, "/index.html"));
  if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const [name, path] of [["home", "index.html"], ["about", "about.html"]])
  for (const w of [375, 768, 1280, 1920]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 } });
    await page.goto(`${base}/landing-page/${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(outDir, `${name}-${w}.png`), fullPage: true });
    await page.close();
  }
await browser.close();
server.close();

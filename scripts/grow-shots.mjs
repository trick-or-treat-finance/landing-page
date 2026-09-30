// Shots of the "watch the treat grow" section, light and dark, at 375 and 1280.
// Usage: npm run build && CHROMIUM_PATH=... node scripts/grow-shots.mjs <outDir>
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const dist = resolve("dist");
const outDir = resolve(process.argv[2] ?? "shots/grow");
mkdirSync(outDir, { recursive: true });
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif" };
const server = createServer((req, res) => {
  const f = join(dist, req.url.split(/[?#]/)[0].replace("/landing-page", "").replace(/\/$/, "/index.html"));
  if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const scheme of ["light", "dark"]) for (const w of [375, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/landing-page/index.html`, { waitUntil: "networkidle" });
  await page.evaluate((s) => { document.documentElement.dataset.theme = s; }, scheme);
  await page.locator("#grow").screenshot({ path: join(outDir, `grow-${scheme}-${w}.png`) });
  await ctx.close();
}
await browser.close();
server.close();

// Screenshots of the built home page: full page at 375/768/1280/1920, hero at rest, hero mid-flip.
// Usage: npm run build && CHROMIUM_PATH=... node scripts/shots.mjs [outDir]
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const dist = resolve("dist");
const outDir = resolve(process.argv[2] ?? "shots");
mkdirSync(outDir, { recursive: true });
const T = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = createServer((req, res) => {
  const f = join(dist, req.url.split(/[?#]/)[0].replace("/landing-page", "").replace(/\/$/, "/index.html"));
  if (!f.startsWith(dist) || !existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": T[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/landing-page/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const open = async (w, h = 900, opts = {}) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, ...opts });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return page;
};
for (const w of [375, 768, 1280, 1920]) {
  const page = await open(w);
  await page.screenshot({ path: join(outDir, `home-${w}.png`), fullPage: true });
  await page.close();
}
// Hero at rest, then the same frame mid-flip and after the flip.
const page = await open(1280, 1000);
const stage = page.locator(".stage-sec");
await stage.scrollIntoViewIfNeeded();
await page.evaluate(() => document.querySelector(".stage-sec").scrollIntoView({ block: "start" }));
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "hero-rest.png") });
await page.click("#sw");
await page.waitForTimeout(430);
await page.screenshot({ path: join(outDir, "hero-mid-flip.png") });
await page.waitForTimeout(1400);
await page.screenshot({ path: join(outDir, "hero-treat.png") });
await page.close();
const dark = await open(1280, 900, { colorScheme: "dark" });
await dark.screenshot({ path: join(outDir, "home-1280-dark.png"), fullPage: true });
await browser.close();
server.close();

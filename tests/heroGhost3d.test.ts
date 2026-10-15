import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";

// Scenarios: features/hero-ghost-3d.feature
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const out = mkdtempSync(join(tmpdir(), "tot-hero-"));
const html = () => readFileSync(join(out, "index.html"), "utf8");
const KB = 1024;

let server: Server, base: string, browser: Browser;
beforeAll(async () => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
  server = createServer((req, res) => {
    const file = join(out, (req.url ?? "/").split(/[?#]/)[0]!.replace(/\/$/, "/index.html"));
    if (!file.startsWith(out) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = stubBeehiiv(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }));
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); }, 60_000);

const heroFetches = async (width: number): Promise<{ url: string; bytes: number }[]> => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const got: { url: string; bytes: number }[] = [];
  page.on("response", async (r) => { if (r.url().includes("/hero/")) got.push({ url: r.url(), bytes: (await r.body()).length }); });
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  await page.close();
  return got;
};

describe("Feature: the hero shows the 3D ghost picture instead of the old 2D drawing", () => {
  for (const scheme of ["light", "dark"] as const) for (const width of [390, 1280]) {
    it(`Scenario: The picture is in the hero, in light and dark (${width}px ${scheme})`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: scheme });
      await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
      expect(await page.locator(".hero .hero-art").count()).toBe(1);
      expect(await page.locator(".hero svg.hero-art, .hero img").count()).toBe(1);
      const art = (await page.locator(".hero-art").boundingBox())!;
      const img = (await page.locator(".hero-art img").boundingBox())!;
      expect(img.x).toBeGreaterThanOrEqual(art.x - 1);
      expect(img.x + img.width).toBeLessThanOrEqual(art.x + art.width + 1);
      expect(art.x + art.width).toBeLessThanOrEqual(width);
      expect(Math.abs(img.width / img.height - 1.5)).toBeLessThan(0.02);
      // Framed on purpose: a dark rounded card in both modes, so the dark edges of the art never sit raw on a pale page.
      const frame = await page.locator(".hero-art").evaluate((n) => ({ radius: getComputedStyle(n).borderTopLeftRadius, bg: getComputedStyle(n).backgroundColor }));
      expect(parseFloat(frame.radius)).toBeGreaterThan(8);
      expect(frame.bg).toMatch(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\)$/);
      expect(Math.max(...(frame.bg.match(/\d+/g) ?? []).map(Number))).toBeLessThan(40);
      for (const sel of [".hero-title", ".hero-plain", "#see-treat", ".hero-hint"]) {
        const b = (await page.locator(sel).boundingBox())!;
        const clash = b.x < art.x + art.width && b.x + b.width > art.x && b.y < art.y + art.height && b.y + b.height > art.y;
        expect(clash, `${sel} overlaps the picture`).toBe(false);
      }
      await page.close();
    });
  }

  it("Scenario: The old 2D hero drawing is gone", () => {
    expect(html()).not.toMatch(/<svg class="hero-art"/);
    expect(html()).not.toContain("holding a long, curling receipt");
    expect(html()).not.toContain("hero-note");
    const css = readFileSync(join(process.cwd(), "src/landing.css"), "utf8");
    expect(css).not.toContain("aspect-ratio: 1; display: block; overflow: visible");
    const files = readdirSync(join(out, "hero"));
    expect(files.length).toBeGreaterThan(6);
    for (const f of files) expect(html(), f).toContain(`/hero/${f}`);
  });

  it("Scenario: The file is small, modern and has a fallback", async () => {
    const h = html();
    const picture = h.match(/<picture class="hero-art">(.*?)<\/picture>/s)![1]!;
    expect(picture).toMatch(/<source type="image\/avif" srcset="[^"]+" sizes="[^"]+"/);
    expect(picture).toMatch(/<source type="image\/webp" srcset="[^"]+" sizes="[^"]+"/);
    expect(picture).toMatch(/<img src="\/hero\/[^"]+\.jpg"/);
    const widths = [...picture.matchAll(/\/hero\/ghost-receipts-(\d+)\.avif (\d+)w/g)].map((m) => Number(m[2]));
    expect(widths).toEqual([768, 1152, 1536]);
    const desktop = await heroFetches(1280);
    expect(desktop).toHaveLength(1);
    expect(desktop[0]!.bytes).toBeLessThanOrEqual(150 * KB);
    const phone = await heroFetches(390);
    expect(phone).toHaveLength(1);
    expect(phone[0]!.url).toContain("-768.");
    for (const f of readdirSync(join(out, "hero"))) expect(statSync(join(out, "hero", f)).size, f).toBeLessThan(400 * KB);
    expect(existsSync(join(out, "ghost-receipts.png"))).toBe(false);
  });

  it("Scenario: The picture does not shift the page", async () => {
    const img = html().match(/<picture class="hero-art">.*?(<img [^>]*>)/s)![1]!;
    expect(img).toContain('width="1536"');
    expect(img).toContain('height="1024"');
    expect(img).toContain('fetchpriority="high"');
    expect(img).not.toMatch(/loading="lazy"/);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.01);
    await page.close();
  });

  it("Scenario: The alt text says what it shows", () => {
    const alt = html().match(/<picture class="hero-art">.*?<img [^>]*alt="([^"]+)"/s)![1]!;
    for (const word of ["ghost", "receipt", "Amazon", "Starbucks", "Apple", "Netflix", "Spotify"]) expect(alt, word).toContain(word);
    expect(html()).not.toMatch(/<picture class="hero-art"[^>]*aria-hidden/);
    expect(html().match(/<picture class="hero-art">.*?<\/picture>/s)![0]).not.toContain("aria-hidden");
  });

  it("Scenario: The company logos in the picture are already disclosed", () => {
    const text = html().replace(/<picture.*?<\/picture>/s, "");
    for (const name of ["Amazon", "Starbucks", "Apple", "Netflix", "Spotify"]) expect(text, name).toContain(name);
    expect(text).toContain("Company names and logos are trademarks of their owners.");
  });

  it("Scenario: Nothing new is loaded or sent", () => {
    const hosts = new Set([...html().matchAll(/(?:href|src|srcset)="https?:\/\/([^/"]+)/g)].map((m) => m[1]));
    expect([...hosts].filter((h) => h !== "trickortreat.fi" && h !== "subscribe-forms.beehiiv.com")).toEqual([]);
    expect(html()).toContain('<meta property="og:image" content="https://trickortreat.fi/og.jpg" />');
    expect(readFileSync(join(out, "og.jpg")).equals(readFileSync(join(process.cwd(), "public/og.jpg")))).toBe(true);
  });

  it('Scenario: The note "same purchases, new sort." is gone from every page', () => {
    const pages = readdirSync(out).filter((f) => f.endsWith(".html"));
    expect(pages.sort()).toEqual(["404.html", "about.html", "hello-hacker.html", "index.html"]);
    for (const p of pages) expect(readFileSync(join(out, p), "utf8"), p).not.toMatch(/same purchases, new sort/i);
    expect(readFileSync(join(process.cwd(), "src/landing.css"), "utf8")).not.toMatch(/\.n3\b/);
    const new_copy = [html().match(/<meta name="description" content="([^"]*)"/)![1], html().match(/<picture class="hero-art">.*?alt="([^"]*)"/s)![1]].join(" ");
    expect(new_copy).not.toMatch(/sort/i);
  });

  it("Scenario: No user-facing copy says sort", () => {
    for (const p of readdirSync(out).filter((f) => f.endsWith(".html"))) {
      const text = readFileSync(join(out, p), "utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
      expect(text.match(/\bsort(s|ed|ing)?\b/gi) ?? [], p).toEqual([]);
    }
    expect(readFileSync(join(process.cwd(), "src/eggs.ts"), "utf8")).not.toMatch(/\bsort(s|ed|ing)?\b/i);
  });

  it("Scenario: The rest of the page still works", () => {
    const h = html();
    expect((h.match(/<h1[ >]/g) ?? []).length).toBe(1);
    expect(h).toContain("your receipts already say who you back.");
    expect(h).toContain("Trick or Treat is a personal finance app. See which companies get your money.");
    expect(h).toContain('id="theme"');
  });
});

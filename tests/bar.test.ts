import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";

// The bar from the brief: JS <= 60 KB gzipped, 0 third-party requests, no-JS render,
// reduced-motion stills, keyboard operation, no sideways scroll at four widths.
const BASE = "/landing-page/";
const out = mkdtempSync(join(tmpdir(), "tot-bar-"));
const TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".avif": "image/avif", ".webp": "image/webp",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff",
};
let server: Server, base: string, browser: Browser;

beforeAll(async () => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]));
    const rel = path.startsWith(BASE) ? path.slice(BASE.length - 1) : null;
    const file = rel === null ? "" : join(out, rel.endsWith("/") ? rel + "index.html" : rel);
    if (rel === null || !file.startsWith(out) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}${BASE}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); });

describe("bundle", () => {
  it("ships at most 60 KB of gzipped JavaScript", () => {
    const dir = join(out, "assets");
    const total = readdirSync(dir).filter((f) => f.endsWith(".js"))
      .reduce((n, f) => n + gzipSync(readFileSync(join(dir, f))).length, 0);
    expect(total).toBeLessThanOrEqual(60 * 1024);
  });
});

describe("requests", () => {
  it("makes no request to any other origin, and none after load", async () => {
    const page = await browser.newPage();
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.click("#sw");
    await page.waitForTimeout(1500);
    await page.close();
    expect(urls.length).toBeGreaterThan(3);
    expect(urls.filter((u) => new URL(u).origin !== new URL(base).origin)).toEqual([]);
  });
});

describe("no JS", () => {
  it("still shows the receipt, every tile and the slip reasons", async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(base);
    const text = await page.innerText("body");
    expect(text).toContain("$4,812.63");
    expect(text).toContain("JavaScript is off");
    for (const n of ["Walmart", "Costco", "Spotify", "NVIDIA", "Tesla", "Alphabet"]) expect(text).toContain(n);
    expect(text).toContain("Trick or Treat asks your bank for transactions only");
    expect(await page.locator(".tiles-wrap").isVisible()).toBe(true);
    expect(await page.locator(".tiles .tile").count()).toBe(12);
    await ctx.close();
  });
});

describe("reduced motion", () => {
  it("flips instantly with no travel, and the strikes and notes are drawn", async () => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await page.click("#sw");
    const anims = await page.evaluate(() => document.getAnimations().filter((a) => (a as CSSAnimation).animationName !== "appear").length);
    expect(anims).toBe(0);
    expect(await page.getAttribute(".stage", "data-view")).toBe("treat");
    expect(await page.innerText("#total")).toBe("$100.00");
    expect(await page.locator(".slot.gone").count()).toBe(12);
    expect(await page.evaluate(() => document.querySelector(".slip-sec")!.classList.contains("slip-pre"))).toBe(false);
    await ctx.close();
  });
});

describe("keyboard", () => {
  it("switch, chips, sliders and slip work from the keyboard", async () => {
    const page = await browser.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await page.focus("#sw");
    await page.keyboard.press("ArrowRight");
    expect(await page.getAttribute("#sw", "aria-checked")).toBe("true");
    await page.keyboard.press("Space");
    expect(await page.getAttribute("#sw", "aria-checked")).toBe("false");
    await page.focus('.chip[data-id="gym"]');
    await page.keyboard.press("Enter");
    expect(await page.getAttribute('.chip[data-id="gym"]', "aria-pressed")).toBe("true");
    await page.focus("#sl-coffee");
    await page.keyboard.press("ArrowRight");
    expect(await page.innerText('.row[data-id="coffee"] output')).toBe("$87.00");
    await page.focus(".slip-list li:nth-child(2) button");
    await page.keyboard.press("Enter");
    expect(await page.getAttribute(".slip-list li:nth-child(2) button", "aria-expanded")).toBe("true");
    expect(await page.locator("#why2").isVisible()).toBe(true);
    await page.close();
  });
});

describe("sandbox arithmetic", () => {
  it("the made-up total matches the sliders and the basket sums to $100.00", async () => {
    const page = await browser.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    expect(await page.innerText("#sb-total")).toBe("$748.97");
    const cents = (await page.locator(".sb-basket em").allInnerTexts()).map((t) => Math.round(parseFloat(t.replace(/[$,]/g, "")) * 100));
    expect(cents.reduce((a, b) => a + b, 0)).toBe(10000);
    await page.close();
  });
});

describe("overflow", () => {
  for (const w of [375, 768, 1280, 1920]) for (const view of ["trick", "treat"]) {
    it(`no horizontal scroll at ${w}px in the ${view} view`, async () => {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(base, { waitUntil: "networkidle" });
      if (view === "treat") { await page.click("#sw"); await page.waitForTimeout(1300); }
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        return { scroll: de.scrollWidth, client: de.clientWidth };
      });
      await page.close();
      expect(m.scroll).toBeLessThanOrEqual(m.client);
    });
  }
});

// Design gate defects 1 and 2: the stamp must never cover the total, and the logos note
// must never sit on the tiles heading (or anything else in the right column).
describe("overlap", () => {
  type Box = { l: number; t: number; r: number; b: number };
  const hit = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  for (const w of [375, 768, 1280, 1920]) for (const view of ["trick", "treat"]) {
    it(`stamp clears the total, note clears the tiles heading at ${w}px in the ${view} view`, async () => {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(base, { waitUntil: "networkidle" });
      if (view === "treat") { await page.click("#sw"); await page.waitForTimeout(2500); }
      const boxes = await page.evaluate(() => {
        const box = (el: Element | null) => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null;
        };
        const q = (s: string) => document.querySelector(s);
        return {
          stamp: box(q(".stamp")), total: box(q("#total")), note: box(q(".logos-note")),
          heading: box(q(".t-h")), notes: box(q(".treat-notes")), ghost: box(q(".ghost-spot")),
        };
      });
      await page.close();
      expect(boxes.stamp && boxes.total && boxes.note).toBeTruthy();
      expect(hit(boxes.stamp!, boxes.total!)).toBe(false);
      for (const other of [boxes.heading, boxes.notes, boxes.ghost]) if (other) expect(hit(boxes.note!, other)).toBe(false);
    });
  }
});

// Owner request: Buffett + Lynch under the header, above the hero.
const lum = (rgb: number[]): number => {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number[], b: number[]): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const rgbOf = (css: string): number[] => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);

describe("buffett + lynch section", () => {
  it("sits directly under the header and above the hero, with alt naming both men and a set size", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(base, { waitUntil: "networkidle" });
    const m = await page.evaluate(() => {
      const duo = document.querySelector(".duo")!.getBoundingClientRect();
      const hero = document.querySelector(".hero")!.getBoundingClientRect();
      const head = document.querySelector(".site-header")!.getBoundingClientRect();
      const img = document.querySelector<HTMLImageElement>(".duo-img")!;
      return { duo: duo.top, hero: hero.top, headBottom: head.bottom, alt: img.alt, w: img.getAttribute("width"), h: img.getAttribute("height"), loading: img.loading, src: img.currentSrc };
    });
    await page.close();
    expect(m.duo).toBeGreaterThanOrEqual(m.headBottom - 1);
    expect(m.duo).toBeLessThan(m.hero);
    expect(m.alt).toMatch(/Peter Lynch/);
    expect(m.alt).toMatch(/Warren Buffett/);
    expect(m.w).toBe("1697");
    expect(m.h).toBe("927");
    expect(m.loading).toBe("eager");
    expect(m.src).toMatch(/\.avif$/);
  });
  it("carries the attributions, the not-affiliated line and no unverified quote", async () => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(base);
    const text = await page.innerText(".duo");
    await ctx.close();
    expect(text).toContain("Quotes for inspiration. Not affiliated with or endorsed by Warren Buffett or Peter Lynch.");
    expect(text).toContain("Berkshire Hathaway shareholder letter, 1996");
    expect(text).toContain("You only have to be able to evaluate companies within your circle of competence.");
    expect(text).toContain("One Up on Wall Street");
    expect(text).not.toMatch(/Never invest in a business you cannot understand|Know what you own/);
  });
  for (const w of [375, 768, 1280, 1920]) for (const scheme of ["light", "dark"] as const) {
    it(`both faces stay whole and text is >= 4.5:1 at ${w}px in ${scheme}`, async () => {
      const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
      await page.goto(base, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const img = document.querySelector<HTMLImageElement>(".duo-img")!.getBoundingClientRect();
        const bg = (el: Element): string => {
          for (let e: Element | null = el; e; e = e.parentElement) {
            const c = getComputedStyle(e).backgroundColor;
            if (c && c !== "rgba(0, 0, 0, 0)") return c;
          }
          return "rgb(255, 255, 255)";
        };
        const de = document.documentElement;
        const text = [...document.querySelectorAll(".duo-q p, .duo-lede, .duo-note, .duo-title")].map((e) => ({
          fg: getComputedStyle(e).color, bg: bg(e), t: e.className,
        }));
        return { l: img.left, r: img.right, w: img.width, h: img.height, vw: de.clientWidth, text };
      });
      await page.close();
      expect(m.l).toBeGreaterThanOrEqual(0);
      expect(m.r).toBeLessThanOrEqual(m.vw);
      expect(Math.abs(m.w / m.h - 1697 / 927)).toBeLessThan(0.02);
      for (const t of m.text) expect(ratio(rgbOf(t.fg), rgbOf(t.bg)), `${t.t}: ${t.fg} on ${t.bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("dark theme gives the drawing a light backdrop, and light stays straight on white", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
    await page.goto(base, { waitUntil: "networkidle" });
    const dark = await page.evaluate(() => getComputedStyle(document.querySelector(".duo-fig")!).backgroundImage);
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    const light = await page.evaluate(() => getComputedStyle(document.querySelector(".duo-fig")!).backgroundImage);
    await page.close();
    expect(dark).toContain("radial-gradient");
    expect(light).toBe("none");
  });
});

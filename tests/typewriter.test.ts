import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";

const BASE = "/landing-page/";
const PAGES = ["index.html", "about.html"];
const WIDTHS = [375, 768, 1280, 1920];
const out = mkdtempSync(join(tmpdir(), "tot-landing-"));

const TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".avif": "image/avif", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff",
};

function serve(root: string): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]));
    const rel = path.startsWith(BASE) ? path.slice(BASE.length - 1) : null;
    if (rel === null) { res.writeHead(404).end(); return; }
    const file = join(root, rel.endsWith("/") ? rel + "index.html" : rel);
    if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    ok({ server, base: `http://127.0.0.1:${port}` });
  }));
}

import { gzipSync } from "node:zlib";
import { rhythm } from "../src/typewriter";

let server: Server, base: string, browser: Browser;
const url = () => `${base}${BASE}index.html`;

beforeAll(async () => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
  ({ server, base } = await serve(out));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); });

const WORDS = [
  "Peter Lynch", "ran Fidelity's Magellan Fund", "invest in what you know.", "his big idea, from", "One Up on Wall Street",
  "look at your receipt: every company on it is one you already know.",
  "How to Use What You Already Know to Make Money in the Market", "the book's subtitle",
  "Warren Buffett", "chairman of Berkshire Hathaway",
  "You don't have to be an expert on every company, or even many. You only have to be able to evaluate companies within your circle of competence.",
  "Berkshire Hathaway shareholder letter, 1996", "translation: start with what you already understand, and skip the rest.",
  "Quotes for inspiration. Not affiliated with or endorsed by Warren Buffett or Peter Lynch. Investing is the idea behind Trick or Treat, not something the app does today. Not investment advice.",
];
const flat = (t: string) => t.replace(/\s+/g, " ");

/** Opens the page with an AudioContext spy; the counter survives in window.__audio. */
async function open(opts: { js?: boolean; reduced?: boolean; scheme?: "light" | "dark"; width?: number } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1280, height: 900 },
    javaScriptEnabled: opts.js !== false,
    reducedMotion: opts.reduced ? "reduce" : "no-preference",
    colorScheme: opts.scheme ?? "light",
  });
  const hosts = new Set<string>();
  const page = await ctx.newPage();
  page.on("request", (r) => { if (!r.url().startsWith("data:")) hosts.add(new URL(r.url()).host); });
  await page.addInitScript(() => {
    (window as unknown as { __audio: number }).__audio = 0;
    const Real = window.AudioContext;
    (window as unknown as { AudioContext: unknown }).AudioContext = class extends Real { constructor() { super(); (window as unknown as { __audio: number }).__audio++; } };
  });
  await page.goto(url(), { waitUntil: "networkidle" });
  return { ctx, page, hosts };
}
const scrollToQuotes = (page: import("playwright-core").Page) => page.evaluate(() => document.querySelector(".duo-quotes")!.scrollIntoView({ block: "center" }));
const typed = (page: import("playwright-core").Page) => page.evaluate(() => document.querySelectorAll(".tw-c.on").length);

describe("typewriter quotes", () => {
  it("all words are in the served HTML, so they show without JS", async () => {
    const html = flat(readFileSync(join(out, "index.html"), "utf8").replace(/<[^>]+>/g, "").replace(/&ldquo;|&rdquo;/g, "").replace(/&#39;/g, "'"));
    for (const w of WORDS) expect(html, w).toContain(w.replace(/\u201c|\u201d/g, ""));
    const { ctx, page } = await open({ js: false });
    const t = flat(await page.locator(".duo-quotes").evaluate((e) => e.textContent ?? ""));
    for (const w of WORDS.slice(0, -1)) expect(t, w).toContain(w);
    expect(await page.locator(".tw-layer").count()).toBe(0);
    expect(await page.locator(".duo-q p").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).opacity === "1"))).toBe(true);
    await ctx.close();
  });

  it("reduced motion: text shown at once, no typing layer, no sound control, no audio", async () => {
    const { ctx, page } = await open({ reduced: true });
    await scrollToQuotes(page);
    await page.waitForTimeout(500);
    expect(await page.locator(".tw-layer").count()).toBe(0);
    expect(await page.locator(".tw-sound").isVisible()).toBe(false);
    expect(await page.locator(".duo-q p").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).opacity === "1" && (p as HTMLElement).offsetHeight > 0))).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __audio: number }).__audio)).toBe(0);
    await ctx.close();
  });

  it("switching to reduced motion mid-page: text shown, toggle off and hidden, no audio", async () => {
    const { ctx, page } = await open();
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 10);
    const btn = page.locator("#tw-sound");
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    expect(await page.locator("#tw-state").textContent()).toBe("on");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => !document.querySelector(".tw-layer"));
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    expect(await page.locator("#tw-state").textContent()).toBe("off");
    expect(await btn.isVisible()).toBe(false);
    expect(await page.locator(".duo-q p").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).opacity === "1"))).toBe(true);
    const spy = await page.evaluate(() => {
      const w = window as unknown as { __n: number };
      w.__n = 0;
      const P = AudioContext.prototype;
      for (const k of ["createBufferSource", "createOscillator"] as const) { const o = P[k]; (P as never as Record<string, unknown>)[k] = function (this: AudioContext) { w.__n++; return (o as () => unknown).call(this); }; }
      return true;
    });
    expect(spy).toBe(true);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as unknown as { __n: number }).__n)).toBe(0);
    await ctx.close();
  });

  it("a throwing audio hook still ends with all the text shown", async () => {
    const { ctx, page } = await open();
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 3);
    await page.locator("#tw-sound").click();
    await page.evaluate(() => { AudioContext.prototype.createBufferSource = () => { throw new Error("boom"); }; });
    await page.waitForFunction(() => !document.querySelector(".tw-layer"), undefined, { timeout: 10_000 });
    expect(await page.locator(".duo-q p").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).opacity === "1"))).toBe(true);
    await ctx.close();
  });

  for (const key of ["Enter", " ", "Escape"]) {
    it(`keyboard: ${key === " " ? "Space" : key} skips to the end, focus ring is visible`, async () => {
      const { ctx, page } = await open();
      await scrollToQuotes(page);
      await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 5);
      if (key !== "Escape") {
        await page.locator(".duo-quotes").focus();
        await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
        expect(await page.evaluate(() => document.activeElement?.classList.contains("duo-quotes"))).toBe(true);
        expect(await page.locator(".duo-quotes").evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe("none");
      }
      await page.keyboard.press(key);
      await page.waitForFunction(() => !document.querySelector(".tw-layer"));
      expect(await page.locator(".duo-q p").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).opacity === "1"))).toBe(true);
      expect(await page.locator(".duo-quotes").getAttribute("tabindex")).toBeNull();
      await ctx.close();
    });
  }

  it("the caret is a thin, soft bar", async () => {
    const { ctx, page } = await open();
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelector(".tw-caret"));
    const c = await page.locator(".tw-caret").first().evaluate((e) => { const s = getComputedStyle(e, "::after"); return { w: parseFloat(s.width), o: parseFloat(s.opacity) }; });
    expect(c.w).toBeLessThanOrEqual(3);
    await ctx.close();
  });

  it("real text stays in the DOM while typing; the animated layer is aria-hidden", async () => {
    const { ctx, page } = await open();
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 20);
    const m = await page.evaluate(() => ({
      layers: [...document.querySelectorAll(".tw-layer")].map((l) => l.getAttribute("aria-hidden")),
      real: [...document.querySelectorAll(".duo-q > p")].map((p) => p.textContent).join(" "),
    }));
    expect(m.layers.length).toBe(2);
    expect(m.layers.every((a) => a === "true")).toBe(true);
    expect(flat(m.real)).toContain("circle of competence.");
    await ctx.close();
  });

  it("does not start before the section is in view, and reserves its height (no layout shift)", async () => {
    const { ctx, page } = await open();
    expect(await typed(page)).toBe(0);
    const h0 = await page.evaluate(() => document.querySelector(".duo-quotes")!.getBoundingClientRect().height);
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 60);
    const h1 = await page.evaluate(() => document.querySelector(".duo-quotes")!.getBoundingClientRect().height);
    await page.locator(".duo-quotes").click({ position: { x: 5, y: 60 } });
    await page.waitForFunction(() => !document.querySelector(".tw-layer"));
    const h2 = await page.evaluate(() => document.querySelector(".duo-quotes")!.getBoundingClientRect().height);
    expect([h1, h2]).toEqual([h0, h0]);
    await ctx.close();
  });

  it("a click skips to the end, with everything visible", async () => {
    const { ctx, page } = await open();
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 5);
    await page.locator(".duo-quotes").click({ position: { x: 5, y: 60 } });
    await page.waitForFunction(() => !document.querySelector(".tw-layer"));
    expect(await page.locator(".duo-q p").evaluateAll((ps) => ps.every((p) => getComputedStyle(p).opacity === "1"))).toBe(true);
    await ctx.close();
  });

  it("no audio context exists before a click on the sound toggle; the toggle starts off and is remembered only in the page", async () => {
    const { ctx, page } = await open();
    const btn = page.locator("#tw-sound");
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 40);
    expect(await page.evaluate(() => (window as unknown as { __audio: number }).__audio)).toBe(0);
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("true");
    expect(await page.evaluate(() => (window as unknown as { __audio: number }).__audio)).toBe(1);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await btn.click();
    expect(await btn.getAttribute("aria-pressed")).toBe("false");
    await ctx.close();
  });

  it("makes no third-party requests and loads no audio file", async () => {
    const { ctx, page, hosts } = await open();
    await scrollToQuotes(page);
    await page.waitForFunction(() => document.querySelectorAll(".tw-c.on").length > 30);
    await page.locator("#tw-sound").click();
    await page.waitForTimeout(300);
    expect([...hosts]).toEqual([new URL(base).host]);
    expect(readdirSync(join(out, "assets")).filter((f) => /\.(mp3|wav|ogg|m4a|aac)$/.test(f))).toEqual([]);
    await ctx.close();
  });

  it("JS + CSS stay within 60 KB gzipped", () => {
    const dir = join(out, "assets");
    let total = 0;
    for (const f of readdirSync(dir)) if (/\.(js|css)$/.test(f)) total += gzipSync(readFileSync(join(dir, f))).length;
    expect(total).toBeLessThanOrEqual(60 * 1024);
  });

  for (const scheme of ["light", "dark"] as const) {
    it(`text contrast is at least 4.5:1 in ${scheme}`, async () => {
      const { ctx, page } = await open({ scheme });
      const rows = await page.evaluate(() => {
        const lum = (rgb: string) => {
          const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const bg = getComputedStyle(document.body).backgroundColor;
        const out: [string, number][] = [];
        for (const sel of [".duo-who", ".duo-who > span", ".duo-idea", ".duo-line", ".duo-line-lg", ".duo-src", ".duo-tie", ".duo-note", ".tw-sound", ".tw-sound b"]) {
          const el = document.querySelector(sel)!;
          const [a, b] = [lum(getComputedStyle(el).color), lum(bg)].sort((x, y) => y - x);
          out.push([sel, (a + 0.05) / (b + 0.05)]);
        }
        return out;
      });
      for (const [sel, ratio] of rows) expect(ratio, `${sel} ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      await ctx.close();
    });
  }
});

describe("rhythm", () => {
  const seeded = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  it("gives every character a small delay and rests longer after punctuation", () => {
    const text = "one two. three, four";
    const beats = rhythm(text, seeded());
    expect(beats).toHaveLength(text.length);
    const after = (i: number) => beats[i].wait;
    expect(after(text.indexOf(" three"))).toBeGreaterThan(150); // space after "."
    expect(after(text.indexOf(" four"))).toBeGreaterThan(100);  // space after ","
    expect(after(text.indexOf(" two"))).toBeLessThan(60);       // plain word gap
    expect(beats.every((b) => b.wait > 5)).toBe(true);
  });
});

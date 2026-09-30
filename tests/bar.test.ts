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
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png",
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

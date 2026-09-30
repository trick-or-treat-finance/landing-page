import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";

const BASE = "/landing-page/";
const out = mkdtempSync(join(tmpdir(), "tot-grow-"));
const TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".avif": "image/avif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff",
};
let server: Server, base: string, browser: Browser;

beforeAll(async () => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]));
    const rel = path.startsWith(BASE) ? path.slice(BASE.length - 1) : null;
    const file = rel === null ? "" : join(out, rel.endsWith("/") ? rel + "index.html" : rel);
    if (!file || !file.startsWith(out) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); });

const open = async (opts: { js?: boolean; scheme?: "light" | "dark"; reduced?: boolean; width?: number } = {}) => {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1280, height: 900 }, javaScriptEnabled: opts.js ?? true,
    colorScheme: opts.scheme ?? "light", reducedMotion: opts.reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const foreign: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith(base)) foreign.push(r.url()); });
  await page.goto(`${base}${BASE}index.html`, { waitUntil: "networkidle" });
  return { ctx, page, foreign };
};

describe("grow section in the browser", () => {
  it("no JS: shows the static $100 a month, 10 years, 7% example", async () => {
    const { ctx, page } = await open({ js: false });
    const text = await page.locator("#grow").innerText();
    expect(text).toContain("$17,409.45");
    expect(text).toContain("$12,000.00");
    expect(text).toContain("Illustration only. Example rate, not a prediction or a return for any company shown.");
    expect(await page.locator("#g-years").isDisabled()).toBe(true);
    await ctx.close();
  });

  it("moving the controls redraws the numbers, keyboard included; 0 third-party requests", async () => {
    const { ctx, page, foreign } = await open();
    expect(await page.locator("#g-years").isDisabled()).toBe(false);
    await page.locator("#g-years").focus();
    await page.keyboard.press("End");
    await page.locator("#g-rate").focus();
    await page.keyboard.press("End");
    expect(await page.locator(".g-n-val b").innerText()).toBe("$352,991.31");
    expect(await page.locator("#g-years-o").innerText()).toBe("30");
    expect(await page.locator("#g-rate-o").innerText()).toBe("12%");
    await page.locator("#g-rate").focus();
    await page.keyboard.press("Home");
    expect(await page.locator(".g-n-val b").innerText()).toBe("$36,000.00");
    await page.getByLabel("$100 once").check();
    await page.locator("#g-years").focus();
    await page.keyboard.press("Home");
    await page.locator("#g-rate").focus();
    await page.keyboard.press("End");
    expect(await page.locator(".g-n-val b").innerText()).toBe("$112.67");
    expect(await page.locator(".g-svg").getAttribute("aria-label")).toContain("$100 once, 1 year");
    expect(foreign).toEqual([]);
    await ctx.close();
  });

  it("reduced motion: nothing animates", async () => {
    const { ctx, page } = await open({ reduced: true });
    await page.locator("#grow").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const anim = await page.evaluate(() => [...document.querySelectorAll("#grow .g-val, #grow .g-put, #grow .g-area")]
      .map((e) => getComputedStyle(e).animationName));
    expect(anim.every((a) => a === "none")).toBe(true);
    expect(await page.locator("#grow").evaluate((e) => e.classList.contains("g-first"))).toBe(false);
    await ctx.close();
  });

  for (const scheme of ["light", "dark"] as const) {
    it(`every text in the section has contrast >= 4.5:1 (${scheme})`, async () => {
      const { ctx, page } = await open({ scheme, reduced: true });
      await page.evaluate((s) => { document.documentElement.dataset.theme = s; }, scheme);
      const bad = await page.evaluate(() => {
        const lum = (c: number[]) => {
          const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
        };
        const rgba = (s: string) => {
          const m = s.match(/[\d.]+/g)!.map(Number);
          return { c: m.slice(0, 3), a: m[3] ?? 1 };
        };
        const bgOf = (el: Element | null): number[] => {
          let acc = [255, 255, 255];
          const stack: { c: number[]; a: number }[] = [];
          for (; el; el = el.parentElement) {
            const b = rgba(getComputedStyle(el).backgroundColor);
            if (b.a > 0) stack.push(b);
            if (b.a === 1) break;
          }
          for (const b of stack.reverse()) acc = acc.map((v, k) => v * (1 - b.a) + b.c[k]! * b.a);
          return acc;
        };
        const offenders: string[] = [];
        for (const el of document.querySelectorAll("#grow *")) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
          if (!own) continue;
          const cs = getComputedStyle(el);
          const isSvg = el instanceof SVGElement;
          const fg = rgba(isSvg ? cs.fill : cs.color);
          const bg = bgOf(el);
          const eff = fg.c.map((v, k) => v * fg.a + bg[k]! * (1 - fg.a));
          const l1 = lum(eff), l2 = lum(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio < 4.5 || Number(cs.opacity) < 1) offenders.push(`${el.tagName}.${el.getAttribute("class")}${ratio.toFixed(2)}`);
        }
        return offenders;
      });
      expect(bad).toEqual([]);
      await ctx.close();
    });
  }
});

describe("bundle", () => {
  it("total gzipped JS + CSS stays <= 60 KB", () => {
    const dir = join(out, "assets");
    const files = readdirSync(dir).filter((f) => /\.(js|css)$/.test(f));
    const gz = files.reduce((n, f) => n + gzipSync(readFileSync(join(dir, f))).length, 0);
    expect(gz).toBeLessThanOrEqual(60 * 1024);
    expect(statSync(dir).isDirectory()).toBe(true);
  });
});

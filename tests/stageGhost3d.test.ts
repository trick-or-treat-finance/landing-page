import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";

// Scenarios: features/stage-ghost-3d.feature
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
const out = mkdtempSync(join(tmpdir(), "tot-stage-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CASES = [[390, "light"], [390, "dark"], [1280, "light"], [1280, "dark"]] as const;
const underBudget = (bytes: number): boolean => bytes <= 150 * 1024;
const ALT = "Ghost with a bank backpack checking a green phone";

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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); }, 60_000);

const open = async (width: number, scheme: "light" | "dark", js = true): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: "reduce", javaScriptEnabled: js });
  const page = await ctx.newPage();
  // A deferred module script has run by "load", so that is the page being ready. "networkidle" restarts its quiet timer on every late request (fonts, the lazy picture) and drifts under load; a stalled action now fails in 15 s naming itself instead of the whole scenario timing out at 30 s.
  page.setDefaultTimeout(15_000);
  await page.goto(`${base}/index.html`, { waitUntil: "load" });
  return page;
};
const box = (page: Page, sel: string) => page.locator(sel).first().boundingBox();

describe("Feature: the 3D ghost stands beside the receipt on the Trick view", () => {
  for (const [width, scheme] of CASES) {
    it(`Scenario: A transparent picture with a real description sits by the receipt (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      const pic = page.locator(".right-stack > picture.stage-ghost");
      expect(await pic.count()).toBe(1);
      const img = pic.locator("img");
      expect(await img.getAttribute("alt")).toBe(ALT);
      expect(await img.getAttribute("loading")).toBe("lazy");
      expect([await img.getAttribute("width"), await img.getAttribute("height")]).toEqual(["1333", "1180"]);
      expect(await pic.locator("source").evaluateAll((s) => s.map((e) => (e as HTMLSourceElement).type))).toEqual(["image/avif", "image/webp"]);
      expect(await img.getAttribute("src")).toMatch(/^\/stage\/.+\.png$/);
      await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => (document.querySelector(".stage-ghost img") as HTMLImageElement).complete);
      const r = (await box(page, ".stage-ghost img"))!, rc = (await box(page, ".receipt-area"))!;
      expect(r.width).toBeGreaterThan(150);
      expect(Math.abs(r.width / r.height - 1333 / 1180)).toBeLessThan(0.02);
      if (width >= 1101) { expect(r.x).toBeGreaterThanOrEqual(rc.x + rc.width); expect(Math.abs(r.y - rc.y)).toBeLessThan(160); } else expect(r.y).toBeGreaterThanOrEqual(rc.y + rc.height - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      // No card or backdrop behind it: every box from the picture up to the stack is see-through and unframed.
      const framed = await page.evaluate(() => {
        const bad: string[] = [];
        for (let e: Element | null = document.querySelector(".stage-ghost img"); e && !e.classList.contains("desk"); e = e.parentElement) {
          const c = getComputedStyle(e);
          if (c.backgroundColor !== "rgba(0, 0, 0, 0)" || c.backgroundImage !== "none" || c.boxShadow !== "none" || parseFloat(c.borderTopWidth) > 0 || c.filter !== "none") bad.push(e.tagName + "." + e.className);
        }
        return bad;
      });
      expect(framed).toEqual([]);
      const a = await page.evaluate(async () => {
        const i = document.querySelector(".stage-ghost img") as HTMLImageElement; await i.decode();
        const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight;
        const g = c.getContext("2d")!; g.drawImage(i, 0, 0);
        return [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]].map(([x, y]) => g.getImageData(x!, y!, 1, 1).data[3]);
      });
      expect(a).toEqual([0, 0, 0, 0]);
      await page.context().close();
    });

    it(`Scenario: The switch works; Trick shows the ghost, Treat gives its column to the tiles (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      const ghost = page.locator(".stage-ghost");
      const check = async (view: string) => {
        expect(await page.locator(".desk").getAttribute("data-view")).toBe(view);
        await expect(ghost.isVisible()).resolves.toBe(view === "trick");
        if (view === "treat") return;
        await ghost.scrollIntoViewIfNeeded();
        const g = (await box(page, ".stage-ghost img"))!;
        for (const sel of [".switch-wrap", ".receipt-area"]) {
          const o = (await box(page, sel))!;
          expect(g.x + g.width <= o.x + 1 || o.x + o.width <= g.x + 1 || g.y + g.height <= o.y + 1 || o.y + o.height <= g.y + 1, sel).toBe(true);
        }
        expect(g.x).toBeGreaterThanOrEqual(0); expect(g.x + g.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      };
      await check("trick");
      expect(await page.locator("#sw").getAttribute("aria-checked")).toBe("false");
      await page.locator("#sw").click();
      expect(await page.locator("#sw").getAttribute("aria-checked")).toBe("true");
      await check("treat");
      await page.locator("#sw").focus(); await page.keyboard.press("Space");
      await check("trick");
      await page.keyboard.press("Enter");
      await check("treat");
      await page.context().close();
    });
  }

  it("Scenario: With scripts off the picture does not sit on top of the tiles", async () => {
    const page = await open(1280, "light", false);
    await expect(page.locator(".stage-ghost").isVisible()).resolves.toBe(false);
    await page.context().close();
  });

  it("Scenario: The picture is the stage's only ghost picture and has no card in the css", () => {
    const css = src("src/landing.css");
    const rules = [...css.matchAll(/(^|\})\s*([^{}]*\.stage-ghost[^{}]*)\{([^{}]*)\}/g)].map((m) => m[3]!);
    expect(rules.length, "found no .stage-ghost rule").toBeGreaterThanOrEqual(2);
    for (const r of rules) expect(r).not.toMatch(/background|border|box-shadow|filter|outline/);
  });

  it("Scenario: The master image is not served and the weight check bites", () => {
    expect(readdirSync(join(out, "stage")).filter((f) => /\d+\.(png|avif|webp)$/.test(f)).map((f) => Number(f.match(/(\d+)\.\w+$/)![1])).filter((w) => w >= 1334)).toEqual([]);
    expect(existsSync(join(out, "ghost-stage.png"))).toBe(false);
    expect(underBudget(151 * 1024), "the control: a 151 KB file is over budget").toBe(false);
    for (const f of readdirSync(join(out, "stage")).filter((x) => x.endsWith(".avif"))) expect(underBudget(readFileSync(join(out, "stage", f)).length), f).toBe(true);
  });

  for (const [width, scheme] of [[390, "light"], [1280, "dark"]] as const) {
    it(`Scenario: One stage file of 150 KB or less is fetched, and nothing shifts (${width}px ${scheme})`, async () => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      const got: { url: string; bytes: number }[] = [];
      page.on("response", async (r) => { if (r.url().includes("/stage/")) got.push({ url: r.url(), bytes: (await r.body()).length }); });
      await page.addInitScript(() => { (window as any).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput && e.sources.some((x: any) => x.node?.nodeType === 1 && x.node.closest(".stage-ghost"))) (window as any).__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); });
      await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
      await page.locator(".stage-ghost").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => (document.querySelector(".stage-ghost img") as HTMLImageElement).complete && (document.querySelector(".stage-ghost img") as HTMLImageElement).naturalWidth > 0);
      await page.waitForTimeout(300);
      expect(got).toHaveLength(1);
      expect(got[0]!.url).toMatch(/\.avif$/);
      expect(underBudget(got[0]!.bytes)).toBe(true);
      // Only shifts caused by the picture count: font swaps above the stage move the whole section by a pixel or two on any page.
      expect(await page.evaluate(() => (window as any).__cls)).toBe(0);
      expect(await page.locator(".stage-ghost img").getAttribute("decoding")).toBe("async");
      expect(await page.locator(".stage-ghost img").getAttribute("fetchpriority")).toBeNull();
      await ctx.close();
    });
  }

  for (const [width, scheme] of CASES) {
    it(`Scenario: The corners of the picture's box are the page background (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      await page.locator(".stage-ghost img").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => (document.querySelector(".stage-ghost img") as HTMLImageElement).complete);
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => { const b = document.querySelector(".stage-ghost img")!.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; });
      const px = async (x: number, y: number) => { const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } }); const d = Buffer.concat((() => { const a: Buffer[] = []; let i = 8; while (i < png.length) { const len = png.readUInt32BE(i); if (png.toString("ascii", i + 4, i + 8) === "IDAT") a.push(png.subarray(i + 8, i + 8 + len)); i += 12 + len; } return a; })()); const raw = inflateSync(d); return `${raw[1]},${raw[2]},${raw[3]}`; };
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.slice(0, 3).join(","));
      for (const [x, y] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]] as const) expect(await px(x, y)).toBe(bg.replace(/, /g, ","));
      await page.context().close();
    });
  }

  it("Scenario: The alt is short and honest, and the page adds no host or script", () => {
    const html = read("index.html");
    const alt = html.match(/class="stage-ghost"[\s\S]*?alt="([^"]*)"/)![1]!;
    expect(alt.length).toBeGreaterThan(0); expect(alt.length).toBeLessThan(80);
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
    expect(html).not.toMatch(/\b(Chase|Wells Fargo|Bank of America|Monzo|Revolut)\b/);
  });

  it("Scenario: The served ghost files are modern, small and transparent", () => {
    const files = readdirSync(join(out, "stage"));
    expect(files.filter((f) => f.endsWith(".avif")).length).toBeGreaterThanOrEqual(3);
    expect(files.filter((f) => f.endsWith(".webp")).length).toBeGreaterThanOrEqual(3);
    expect(files.filter((f) => f.endsWith(".png")).length).toBeGreaterThanOrEqual(1);
    expect(files.filter((f) => /\.jpe?g$/.test(f))).toEqual([]);
    for (const f of files) {
      const b = readFileSync(join(out, "stage", f));
      expect(f.endsWith(".png") ? b[25] === 6 : f.endsWith(".webp") ? (b[20]! & 0x10) === 0x10 : b.includes("auxiliary:alpha"), f).toBe(true);
    }
    expect(Math.max(...files.filter((f) => !f.endsWith(".png")).map((f) => readFileSync(join(out, "stage", f)).length))).toBeLessThanOrEqual(150 * 1024);
  });

  it("Scenario: No new hosts or scripts, and no user-facing sort", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/https?:\/\/(?!trickortreat\.fi|www\.w3\.org)[^"' )]*\.(avif|webp|png)/);
    expect(src("index.html")).not.toMatch(/\bsort\b/i);
  });
});

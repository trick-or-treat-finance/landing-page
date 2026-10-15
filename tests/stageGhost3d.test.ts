import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";

// Owner request: the 3D stage ghost returns to the spot the 2D one used, as a transparent picture.
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
const out = mkdtempSync(join(tmpdir(), "tot-stage-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const CASES = [[390, "light"], [390, "dark"], [1280, "light"], [1280, "dark"]] as const;
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
  browser = stubBeehiiv(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }));
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); }, 60_000);

const open = async (width: number, scheme: "light" | "dark", js = true): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, reducedMotion: "reduce", javaScriptEnabled: js });
  const page = await ctx.newPage();
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
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

    it(`Scenario: The switch still works; Treat hides the ghost and Trick brings it back (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      const ghost = page.locator(".stage-ghost");
      await expect(ghost.isVisible()).resolves.toBe(true);
      await page.locator("#sw").click();
      expect(await page.locator(".desk").getAttribute("data-view")).toBe("treat");
      await expect(ghost.isVisible()).resolves.toBe(false);
      await page.locator("#sw").focus(); await page.keyboard.press("Space");
      expect(await page.locator(".desk").getAttribute("data-view")).toBe("trick");
      await expect(ghost.isVisible()).resolves.toBe(true);
      await page.keyboard.press("Enter");
      await expect(ghost.isVisible()).resolves.toBe(false);
      await page.context().close();
    });
  }

  it("Scenario: With scripts off the ghost does not sit on top of the tiles", async () => {
    const page = await open(1280, "light", false);
    await expect(page.locator(".stage-ghost").isVisible()).resolves.toBe(false);
    await page.context().close();
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

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";

// Scenarios: features/stage-ghost-removed.feature
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
const out = mkdtempSync(join(tmpdir(), "tot-stage-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MAX_GAP = 40;
const CASES = [[390, "light"], [390, "dark"], [1280, "light"], [1280, "dark"]] as const;

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
const gaps = (page: Page) => page.evaluate(() => {
  const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
  const sw = top(".switch-wrap");
  const view = document.querySelector(".desk")!.getAttribute("data-view");
  const next = view === "treat" ? top(".tiles-wrap") : top(".receipt-area");
  return { view, below: next.top - sw.bottom, level: Math.abs(next.top - sw.top), wide: innerWidth >= 1101, scroll: document.documentElement.scrollWidth, width: innerWidth };
});

describe("Feature: the 2D ghost on the stage is gone, and nothing is left where it stood", () => {
  for (const [width, scheme] of CASES) {
    it(`Scenario: The 2D stage ghost and its floor shadow are not on the page (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      expect(await page.locator(".ghost-spot, .lamp, .gh, .gh-hero").count()).toBe(0);
      expect(await page.locator('[aria-label*="bank bag"]').count()).toBe(0);
      expect(await page.locator(".stage picture, .stage-sec picture, .stage svg.gh-hero").count()).toBe(0);
      expect(await page.locator(".hero picture.hero-art img").count()).toBe(1);
      expect(await page.locator("#stage").count()).toBe(1);
      await page.context().close();
    });

    it(`Scenario: No empty gap is left where the ghost was (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      for (const view of ["trick", "treat"]) {
        if (view === "treat") await page.click("#sw");
        await page.waitForFunction((v) => document.querySelector(".desk")?.getAttribute("data-view") === v, view);
        const g = await gaps(page);
        expect(g.scroll, "scrolls sideways").toBeLessThanOrEqual(g.width);
        if (g.wide && view === "treat") expect(g.level, "the right column starts level with the left").toBeLessThanOrEqual(8);
        else expect(g.below, `${view}: gap under the switch`).toBeLessThanOrEqual(MAX_GAP);
        expect(g.below).toBeGreaterThanOrEqual(g.wide && view === "treat" ? -400 : 0);
      }
      // The control: a 200 px empty block back where the ghost stood is caught by the gap check.
      await page.click("#sw");
      await page.waitForFunction(() => document.querySelector(".desk")?.getAttribute("data-view") === "trick");
      await page.evaluate(() => { (document.querySelector(".receipt-area") as HTMLElement).style.marginTop = "200px"; });
      expect((await gaps(page)).below, "the control did not leave a gap").toBeGreaterThan(MAX_GAP);
      await page.context().close();
    });
  }

  it("Scenario: No 2D stage drawing is left in the source", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/class="gh[ "]|class="gh-hero|class="lamp|ghost-spot/);
    expect(html).not.toContain("Decorative. The Trick or Treat ghost");
    const files = [...readdirSync(join(process.cwd(), "src")).filter((f) => /\.(ts|css)$/.test(f)).map((f) => `src/${f}`), ...readdirSync(join(process.cwd(), "scripts")).filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`)];
    expect(files.length).toBeGreaterThan(15);
    for (const f of files) expect(src(f), f).not.toMatch(/ghost-spot|\.lamp\b|\.gh-hero|\.hands\b|@keyframes (float|shiver|egg-spin|egg-boop|egg-blink)|\.gh \{/);
    // The peek ghost in the fine print still uses the shared body, so the symbol stays.
    expect(html).toContain('id="ghost-body"');
    expect(html).toContain('href="#ghost-body"');
  });

  for (const key of ["click", "Space", "Enter"] as const) {
    it(`Scenario: The Trick/Treat switch still flips the receipt (${key})`, async () => {
      const page = await open(1280, "light");
      const flip = async () => { if (key === "click") await page.click("#sw"); else { await page.focus("#sw"); await page.keyboard.press(key === "Space" ? " " : "Enter"); } };
      expect(await page.getAttribute("#sw", "aria-checked")).toBe("false");
      expect(await page.locator("#total").innerText()).toBe("$4,449.88");
      await flip();
      await page.waitForFunction(() => document.querySelector("#sw")?.getAttribute("aria-checked") === "true");
      expect(await page.getAttribute(".desk", "data-view")).toBe("treat");
      expect(await page.locator("#live").innerText()).not.toBe("");
      expect(await page.locator(".tiles-wrap").isVisible()).toBe(true);
      expect(await page.locator(".tiles-wrap").innerText()).toContain("Nothing to own.");
      expect(await page.locator(".treat-notes").innerText()).toContain("$2,488.88");
      await flip();
      await page.waitForFunction(() => document.querySelector("#sw")?.getAttribute("aria-checked") === "false");
      expect(await page.getAttribute(".desk", "data-view")).toBe("trick");
      expect(await page.locator(".receipt-area").isVisible()).toBe(true);
      expect(await page.locator(".tiles-wrap").isVisible()).toBe(false);
      await page.context().close();
    });
  }

  it("Scenario: With scripts off the page still shows the sample month", async () => {
    const page = await open(1280, "light", false);
    expect(await page.locator(".receipt-area").isVisible()).toBe(true);
    expect(await page.locator(".lines li").count()).toBeGreaterThan(10);
    expect(read("index.html")).toContain("$2,488.88 of the $4,449.88 maps to a company you can buy");
    await page.context().close();
  });

  it("Scenario: Nothing else on the page changed", () => {
    const html = read("index.html");
    expect(html).toContain("Personal finance app");
    expect(html).toContain("Budget, track your spending, and see exactly which companies get your money.");
    const hosts = new Set([...html.matchAll(/(?:href|src|srcset)="https?:\/\/([^/"]+)/g)].map((m) => m[1]));
    expect([...hosts].filter((h) => h !== "trickortreat.fi" && h !== "subscribe-forms.beehiiv.com")).toEqual([]);
    expect(html).not.toMatch(/\bsort(s|ed|ing)?\b/i);
  });
});

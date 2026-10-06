// The easter eggs (src/eggs.ts): each one fires, says its line, and leaves the page working,
// in flow, and free of horizontal overflow at 320px.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";
import { AWAY_TITLE, HALLOWEEN_TITLE, KONAMI, POKES, isHalloween, konamiMatcher, pokeLine } from "../src/eggs";

const BASE = "/landing-page/";
const out = mkdtempSync(join(tmpdir(), "tot-eggs-"));
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

let server: Server, base: string, browser: Browser;
beforeAll(async () => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
  ({ server, base } = await serve(out));
  browser = stubBeehiiv(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }));
}, 120_000);
afterAll(async () => { await browser?.close(); server?.close(); });

type Opts = { width?: number; reduced?: boolean; search?: string; at?: Date };
async function open({ width = 1280, reduced = false, search = "", at }: Opts = {}): Promise<{ page: Page; logs: string[] }> {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  if (at) await page.clock.install({ time: at });
  await page.goto(`${base}${BASE}index.html${search}`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#sw") && document.documentElement.classList.contains("js"));
  return { page, logs };
}

const toast = (page: Page) => page.evaluate(() => {
  const t = document.querySelector<HTMLElement>(".egg-toast");
  return t && { text: t.textContent, on: t.classList.contains("on"), role: t.getAttribute("role"), position: getComputedStyle(t).position };
});

/** The page still works: the Trick/Treat switch flips, and nothing scrolls sideways. */
async function stillWorks(page: Page): Promise<void> {
  await page.locator("#sw").click();
  expect(await page.locator("#sw").getAttribute("aria-checked")).toBe("true");
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
}

describe("easter eggs: the rules behind them", () => {
  it("Konami matches the full code only, survives a stray extra up, ignores case", () => {
    const m = konamiMatcher();
    expect(["ArrowUp", ...KONAMI.slice(0, -1), "A"].map(m)).toEqual([...Array(KONAMI.length).fill(false), true]);
    expect(KONAMI.slice(1).map(m).some(Boolean)).toBe(false);
  });
  it("the ghost speaks on every third poke and cycles its lines", () => {
    expect([1, 2, 3, 4, 5, 6].map(pokeLine)).toEqual([null, null, POKES[0], null, null, POKES[1]]);
    expect(pokeLine(POKES.length * 3 + 3)).toBe(POKES[0]);
  });
  it("Halloween is 31 October only, or ?halloween", () => {
    expect(isHalloween(new Date(2026, 9, 31, 23, 59))).toBe(true);
    expect(isHalloween(new Date(2026, 9, 30, 12))).toBe(false);
    expect(isHalloween(new Date(2026, 10, 1, 0, 1))).toBe(false);
    expect(isHalloween(new Date(2026, 2, 3), "?halloween")).toBe(true);
  });
});

describe("easter eggs on the home page", () => {
  it("console: devtools gets a note pointing to hello-hacker", async () => {
    const { page, logs } = await open();
    expect(logs.join("\n")).toMatch(/you opened devtools\. respect\.[\s\S]*sample month, not real data[\s\S]*hello-hacker\.html/);
    await stillWorks(page);
    await page.close();
  });

  it("Konami code: a status toast, fixed (no layout shift, no focus taken, nothing fetched), not counted while a slider has focus", async () => {
    const { page } = await open({ width: 320 });
    await page.waitForLoadState("networkidle");
    // Focusing the slider scrolls lazy images into view; load them all first so only the egg's own fetches count.
    await page.evaluate(() =>
      Promise.all(
        [...document.images].map((img) => {
          img.loading = "eager";
          if (img.complete) return null;
          return new Promise((done) => {
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }),
      ),
    );
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.locator(".sand input[type=range]").first().focus();
    for (const k of KONAMI) await page.keyboard.press(k);
    expect(await toast(page)).toBeNull();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const h0 = await page.evaluate(() => document.documentElement.scrollHeight);
    for (const k of KONAMI) await page.keyboard.press(k);
    const t = await toast(page);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    expect(requests).toEqual([]);
    expect(t).toMatchObject({ on: true, role: "status", position: "fixed" });
    expect(t?.text).toContain("money has no cheat codes");
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(h0);
    await stillWorks(page);
    await page.close();
  });

  it("ghost poke: every third click on the hero ghost gets a line, reduced motion included", async () => {
    const { page } = await open({ reduced: true });
    const ghost = page.locator(".gh-hero");
    await ghost.click(); await ghost.click();
    expect(await toast(page)).toBeNull();
    await ghost.click();
    expect(await toast(page)).toMatchObject({ on: true, text: POKES[0] });
    expect(await page.locator(".gh-hero.egg-boop").count()).toBe(0); // reduced motion: no wobble
    await stillWorks(page);
    await page.close();
  });

  it("tab away: the title calls you back, and comes home when you do", async () => {
    const { page } = await open();
    const home = await page.title();
    const flip = (state: "hidden" | "visible") => page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
    await flip("hidden");
    expect(await page.title()).toBe(AWAY_TITLE);
    await flip("visible");
    expect(await page.title()).toBe(home);
    await stillWorks(page);
    await page.close();
  });

  it("Halloween: on 31 October the title changes and one decorative bat crosses at 320px; not on the 30th", async () => {
    const { page } = await open({ width: 320, at: new Date(2026, 9, 31, 20) });
    expect(await page.title()).toBe(HALLOWEEN_TITLE);
    const bat = page.locator("svg.egg-bat");
    expect(await bat.getAttribute("aria-hidden")).toBe("true");
    expect(await bat.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    await stillWorks(page);
    await page.close();

    const calm = await open({ reduced: true, search: "?halloween" });
    expect(await calm.page.title()).toBe(HALLOWEEN_TITLE);
    expect(await calm.page.locator("svg.egg-bat").count()).toBe(0); // reduced motion: no flight
    await calm.page.close();

    const before = await open({ at: new Date(2026, 9, 30, 20) });
    expect(await before.page.title()).not.toBe(HALLOWEEN_TITLE);
    expect(await before.page.locator("svg.egg-bat").count()).toBe(0);
    await before.page.close();
  });
});

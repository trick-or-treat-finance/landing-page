// features/genz-delight.feature: the small delights on the home page. Each one says its line,
// moves nothing in the layout, and leaves the receipt flipping at 320px.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";
import { BOO_LINE, FINE_LINE, THEME_LINES, konamiMatcher, sleepsLine, sleepsToHalloween, wordKeys } from "../src/eggs";
import { SANDBOX, defaultSandbox, sandboxQuip, sandboxTally } from "../src/render";

const BASE = "/";
const out = mkdtempSync(join(tmpdir(), "tot-delight-"));
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
afterAll(async () => { await browser?.close(); server?.close(); }, 60_000);

type Opts = { width?: number; reduced?: boolean; at?: Date; touch?: boolean };
async function open({ width = 1280, reduced = false, at, touch = false }: Opts = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference", ...(touch ? { hasTouch: true, isMobile: true } : {}) });
  if (at) await page.clock.install({ time: at });
  await page.goto(`${base}${BASE}index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("#sw") && document.documentElement.classList.contains("js"));
  return page;
}

const toastText = (page: Page) => page.evaluate(() => {
  const t = document.querySelector<HTMLElement>(".egg-toast");
  return t && t.classList.contains("on") ? t.textContent : null;
});
const hint = (page: Page) => page.locator(".hero-hint").first().innerText();
const noSideways = async (page: Page) => {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
};

describe("delights: the rules behind them", () => {
  it("the words match their keys only, in order, and ignore case", () => {
    const m = konamiMatcher(wordKeys("boo"));
    expect([..."BOO"].map(m)).toEqual([false, false, true]);
    const n = konamiMatcher(wordKeys("boo"));
    expect([..."bxo"].map(n).some(Boolean)).toBe(false);
  });

  it("October counts whole days to the 31st on the visitor's own calendar; no other month counts", () => {
    expect(sleepsToHalloween(new Date(2026, 9, 11, 23, 59))).toBe(20);
    expect(sleepsToHalloween(new Date(2026, 9, 1, 0, 0))).toBe(30);
    expect(sleepsToHalloween(new Date(2026, 9, 30, 12))).toBe(1);
    expect(sleepsToHalloween(new Date(2026, 9, 31, 8))).toBe(0);
    expect(sleepsToHalloween(new Date(2026, 8, 30))).toBeNull();
    expect(sleepsToHalloween(new Date(2026, 10, 1))).toBeNull();
  });

  it("the countdown reads right at 20, 1 and 0", () => {
    expect(sleepsLine(20)).toBe("20 sleeps until halloween");
    expect(sleepsLine(1)).toBe("1 sleep until halloween");
    expect(sleepsLine(0)).toBe("halloween is today");
  });

  it("each side of the theme switch has its own line", () => {
    expect(THEME_LINES.dark).not.toBe(THEME_LINES.light);
    expect(THEME_LINES.dark).toMatch(/lights off/);
    expect(THEME_LINES.light).toMatch(/lights on/);
  });

  it("a made-up month has a joke only when something earns it, and the first match wins", () => {
    const base = defaultSandbox();
    expect(sandboxQuip(base)).toBeNull();
    const driver = { ...base, rideshare: { on: true, cents: 40000 } };
    expect(sandboxQuip(driver)).toMatch(/driver/);
    expect(sandboxTally(driver, "/")).toContain(`class="sb-quip"`);
    expect(sandboxTally(base, "/")).not.toContain("sb-quip");
    const none = Object.fromEntries(SANDBOX.map((k) => [k.id, { on: false, cents: 0 }]));
    expect(sandboxTally(none, "/")).not.toContain("sb-quip");
    expect(sandboxTally(none, "/")).toContain("Tap a category");
    expect(sandboxQuip({ ...base, groceries: { on: true, cents: 90000 } })).toMatch(/ghost army/);
    const everything = Object.fromEntries(SANDBOX.map((k) => [k.id, { on: true, cents: 1000 }]));
    expect(sandboxQuip(everything)).toMatch(/every category/);
  });
});

const fineScale = (page: Page) => page.evaluate(() => {
  const m = getComputedStyle(document.querySelector(".fp")!).transform;
  return m === "none" ? 1 : Number(m.match(/matrix\(([^,]+),/)![1]);
});
const fineText = (page: Page) => page.locator(".site-footer").innerText();
const toFine = async (page: Page) => { await page.locator(".fine-h").scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector(".fine-h")!.scrollIntoView({ block: "center" })); };

describe("delights on the home page", () => {
  it("typing boo answers with a line; a slider with focus is left alone", async () => {
    const page = await open();
    await page.keyboard.type("boo");
    await page.waitForFunction(() => document.querySelector(".egg-toast.on"));
    expect(await toastText(page)).toBe(BOO_LINE);
    await page.close();

    const quiet = await open();
    await quiet.locator("#sl-coffee").focus();
    await quiet.keyboard.type("boo");
    expect(await toastText(quiet)).toBeNull();
    await quiet.close();
  });

  it("typing treat and trick flips the receipt, with a line each time", async () => {
    const page = await open();
    expect(await page.locator("#sw").getAttribute("aria-checked")).toBe("false");
    await page.keyboard.type("treat");
    await page.waitForFunction(() => document.querySelector("#sw")?.getAttribute("aria-checked") === "true");
    expect(await toastText(page)).toMatch(/treat/);
    await page.keyboard.type("trick");
    await page.waitForFunction(() => document.querySelector("#sw")?.getAttribute("aria-checked") === "false");
    expect(await toastText(page)).toMatch(/trick/);
    await page.close();
  });

  it("the hint counts the sleeps in October, says today on the 31st, and is untouched in November", async () => {
    const oct = await open({ at: new Date(2026, 9, 11, 12) });
    expect(await hint(oct)).toContain("20 sleeps until halloween");
    expect(await hint(oct)).toContain("nothing leaves your tab");
    await oct.close();
    const day = await open({ at: new Date(2026, 9, 31, 12) });
    expect(await hint(day)).toContain("halloween is today");
    await day.close();
    const nov = await open({ at: new Date(2026, 10, 11, 12) });
    expect((await hint(nov)).trim()).toBe("example numbers. nothing leaves your tab.");
    await nov.close();
  });

  it("the theme switch answers each way", async () => {
    const page = await open();
    const before = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
    await page.locator("#theme").click();
    await page.waitForFunction(() => document.querySelector(".egg-toast.on"));
    const first = await toastText(page);
    await page.locator("#theme").click();
    await page.waitForFunction((t) => document.querySelector(".egg-toast")?.textContent !== t, first);
    const second = await toastText(page);
    expect(new Set([first, second])).toEqual(new Set([THEME_LINES.dark, THEME_LINES.light]));
    expect(before === "" || before === "light" || before === "dark").toBe(true);
    await page.close();
  });

  it("a key held down is one letter: auto-repeat does not spell a word", async () => {
    const page = await open();
    await page.keyboard.press("b");
    await page.keyboard.down("o");
    await page.keyboard.down("o"); // the held key repeating
    await page.keyboard.up("o");
    expect(await toastText(page)).toBeNull();
    await page.keyboard.press("o");
    await page.waitForFunction(() => document.querySelector(".egg-toast.on"));
    await page.close();
  });

  it("typing treat is announced once: the receipt's own status speaks, the toast is for the eyes", async () => {
    const page = await open();
    await page.keyboard.type("treat");
    await page.waitForFunction(() => document.querySelector("#sw")?.getAttribute("aria-checked") === "true");
    expect(await page.locator("#live").innerText()).not.toBe("");
    expect(await page.locator(".egg-toast").getAttribute("aria-hidden")).toBe("true");
    // Already on the treat side: nothing flips, so nothing else would speak, and the toast does.
    await page.keyboard.type("treat");
    await page.waitForFunction(() => document.querySelector(".egg-toast")?.getAttribute("aria-hidden") === "false");
    await page.close();
  });

  it("the fine print shrinks as a joke, springs back to full size, says its line, and reads as before", async () => {
    const page = await open({ width: 320 });
    const before = await fineText(page);
    await toFine(page);
    await page.waitForFunction(() => { const m = getComputedStyle(document.querySelector(".fp")!).transform.match(/matrix\(([^,]+),/); return m !== null && Number(m[1]) < 0.8; }, null, { timeout: 5000 });
    await noSideways(page);
    await page.waitForFunction((t) => document.querySelector(".egg-toast.on")?.textContent === t, FINE_LINE, { timeout: 8000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".fp")!).transform === "none", null, { timeout: 5000 });
    expect(await fineText(page)).toBe(before);
    const px = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".site-footer p, .site-footer h2, .site-footer h3")].map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(px.length).toBeGreaterThan(8);
    expect(Math.min(...px)).toBeGreaterThanOrEqual(12);
    await noSideways(page);
    await page.close();
  });

  it.each([320, 390])("on a phone (%ipx, touch) the fine print stays at full size and no popup appears", async (width) => {
    const page = await open({ width, touch: true });
    expect(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches)).toBe(true);
    await toFine(page);
    for (let i = 0; i < 12; i++) { expect(await fineScale(page)).toBe(1); await page.waitForTimeout(250); }
    expect(await toastText(page)).toBeNull();
    const px = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".site-footer p")].map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(px.length).toBeGreaterThan(3);
    expect(Math.min(...px)).toBeGreaterThanOrEqual(12);
    await noSideways(page);
    await page.close();
  });

  it("the fine print line is a real line, so the waits below cannot pass on nothing", () => {
    expect(FINE_LINE).toBe("kidding. we're not that kind of company.");
  });

  it("the fine print joke happens once", async () => {
    const page = await open();
    await toFine(page);
    await page.waitForFunction((t) => document.querySelector(".egg-toast.on")?.textContent === t, FINE_LINE, { timeout: 8000 });
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".fp")!).transform === "none", null, { timeout: 5000 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(300);
    await toFine(page);
    await page.waitForTimeout(1500);
    expect(await fineScale(page)).toBe(1);
    await page.close();
  });

  it("with reduced motion the fine print never moves and still says the line", async () => {
    const page = await open({ reduced: true });
    await toFine(page);
    await page.waitForFunction((t) => document.querySelector(".egg-toast.on")?.textContent === t, FINE_LINE, { timeout: 8000 });
    for (let i = 0; i < 6; i++) { expect(await fineScale(page)).toBe(1); await page.waitForTimeout(150); }
    await page.close();
  });

  it("pushing rideshare to the top gets a joke under the tally", async () => {
    const page = await open();
    await page.$eval("#sl-rideshare", (el) => {
      const input = el as HTMLInputElement;
      input.value = input.max;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(await page.locator("#sb-detail .sb-quip").innerText()).toMatch(/driver/);
    await page.close();
  });

  it("with every delight fired, 320px still does not scroll sideways and the receipt still flips", async () => {
    const page = await open({ width: 320, at: new Date(2026, 9, 11, 12) });
    await page.keyboard.type("boo");
    await page.locator("#theme").click();
    await noSideways(page);
    await page.locator("#sw").click();
    expect(await page.locator("#sw").getAttribute("aria-checked")).toBe("true");
    await noSideways(page);
    await page.close();
  });
});

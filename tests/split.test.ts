// features/split-section.feature: the split-the-dinner section on the home page.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";
import { dollars, evenShares } from "../src/split";

const BASE = "/";
const out = mkdtempSync(join(tmpdir(), "tot-split-"));
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

type Opts = { width?: number; reduced?: boolean; js?: boolean };
async function open({ width = 1280, reduced = false, js = true }: Opts = {}): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 }, javaScriptEnabled: js, reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(`${base}${BASE}index.html`, { waitUntil: "load" });
  if (js) await page.waitForFunction(() => document.documentElement.classList.contains("js") && document.querySelector("#split-go"));
  return page;
}

const stateOf = (page: Page) => page.locator("#split-stage").getAttribute("data-state");
const text = (page: Page, sel: string) => page.locator(sel).innerText();
const noSideways = async (page: Page) => {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(m.scroll).toBeLessThanOrEqual(m.client);
};
const cents = (s: string): number => Math.round(Number(s.replace(/[^0-9.]/g, "")) * 100);

describe("the split section: the rules behind it", () => {
  it("dollars are written with cents and a comma, from whole cents", () => {
    expect(dollars(31_200)).toBe("$312.00");
    expect(dollars(7_800)).toBe("$78.00");
    expect(dollars(123_456)).toBe("$1,234.56");
  });

  it("a split is always whole cents that add back to the total, the leftover to the earlier people", () => {
    expect(evenShares(31_200, 4)).toEqual([7_800, 7_800, 7_800, 7_800]);
    expect(evenShares(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
    for (const [total, n] of [[1, 3], [99, 4], [31_201, 4], [100_000, 7]] as const) {
      const shares = evenShares(total, n);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    }
  });
});

describe("the split section on the home page", () => {
  it("says it is coming soon and that the numbers are a sample", async () => {
    const page = await open();
    const sec = (await text(page, "#split")).toLowerCase();
    expect(sec).toContain("coming soon");
    expect(sec).toContain("sample");
    await page.close();
  });

  it("the receipt adds up to $312.00 to the cent and the budget starts over by $72.00", async () => {
    const page = await open();
    const lines = await page.locator(".split-receipt .sl b").allInnerTexts();
    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines.map(cents).reduce((a, b) => a + b, 0)).toBe(31_200);
    expect(await text(page, ".split-total b")).toBe("$312.00");
    const budget = await text(page, "#split-budget-text");
    expect(budget).toContain("$312.00");
    expect(budget).toContain("$240.00");
    expect(budget).toContain("over by $72.00");
    await page.close();
  });

  it("settle up is not offered until the dinner is split, and the hint waits too", async () => {
    const page = await open();
    expect(await page.locator("#split-settle").isVisible()).toBe(false);
    await page.locator("#split-go").click();
    expect(await page.locator("#split-settle").isVisible()).toBe(true);
    await page.locator("#split-go").click();
    expect(await page.locator("#split-settle").isVisible()).toBe(false);
    await page.close();
  });

  it("one tap splits it four ways: your $78.00, three Pending, the bar back under with $162.00 left", async () => {
    const page = await open();
    expect(await stateOf(page)).toBe("whole");
    await page.locator("#split-go").click();
    expect(await stateOf(page)).toBe("split");
    expect(await page.locator("#split-go").getAttribute("aria-pressed")).toBe("true");
    expect(await text(page, ".split-total b")).toBe("$78.00");
    const pending = await page.locator(".stub:not([data-who=you])").allInnerTexts();
    expect(pending).toHaveLength(3);
    for (const p of pending) { expect(p).toContain("$78.00"); expect(p.toLowerCase()).toContain("pending"); }
    expect(await text(page, "#split-pending")).toContain("$234.00");
    const budget = await text(page, "#split-budget-text");
    expect(budget).toContain("$78.00");
    expect(budget).toContain("$162.00 left");
    await page.close();
  });

  it("a screen reader hears the before and after numbers once, in one status line", async () => {
    const page = await open();
    await page.locator("#split-go").click();
    const live = page.locator("#split-live");
    expect(await live.getAttribute("role")).toBe("status");
    const said = await live.innerText();
    for (const part of ["$312.00", "$78.00", "$234.00", "$162.00"]) expect(said).toContain(part);
    // The same state said again is not said twice: the live text only changes with the state.
    await page.waitForTimeout(300);
    expect(await live.innerText()).toBe(said);
    await page.close();
  });

  it("settling up flips Maya, Sam and Jo to paid one after the other, and nothing stays Pending", async () => {
    const page = await open();
    await page.locator("#split-go").click();
    await page.locator("#split-settle").click();
    await page.waitForFunction(() => document.querySelector("#split-stage")?.getAttribute("data-state") === "settled", null, { timeout: 8000 });
    for (const who of ["maya", "sam", "jo"]) {
      expect((await text(page, `.stub[data-who=${who}]`)).toLowerCase()).toContain("paid");
    }
    expect((await text(page, "#split")).toLowerCase()).toContain("all square");
    expect(await page.locator(".stub.pending").count()).toBe(0);
    expect(await text(page, "#split-pending")).not.toContain("$234.00");
    await page.close();
  });

  it("tapping the split button again takes it back", async () => {
    const page = await open();
    await page.locator("#split-go").click();
    await page.locator("#split-go").click();
    expect(await stateOf(page)).toBe("whole");
    expect(await page.locator("#split-go").getAttribute("aria-pressed")).toBe("false");
    expect(await text(page, ".split-total b")).toBe("$312.00");
    expect(await text(page, "#split-budget-text")).toContain("over by $72.00");
    await page.close();
  });

  it("works from the keyboard alone and keeps focus on the button", async () => {
    const page = await open();
    await page.locator("#split-go").focus();
    await page.keyboard.press("Enter");
    expect(await stateOf(page)).toBe("split");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("split-go");
    await page.locator("#split-settle").focus();
    await page.keyboard.press("Space");
    await page.waitForFunction(() => document.querySelector("#split-stage")?.getAttribute("data-state") === "settled", null, { timeout: 8000 });
    await page.close();
  });

  it("settle up works again after undoing mid-flip and splitting again", async () => {
    const page = await open();
    await page.locator("#split-go").click();
    await page.locator("#split-settle").click();
    await page.locator("#split-go").click(); // undo while the stubs are still flipping
    await page.locator("#split-go").click(); // split again
    expect(await page.locator("#split-settle").isDisabled()).toBe(false);
    await page.locator("#split-settle").click();
    await page.waitForFunction(() => document.querySelector("#split-stage")?.getAttribute("data-state") === "settled", null, { timeout: 8000 });
    await page.close();
  });

  it("the undo hint is only described to a screen reader once there is something to undo", async () => {
    const page = await open();
    expect(await page.locator("#split-go").getAttribute("aria-describedby")).toBeNull();
    await page.locator("#split-go").click();
    expect(await page.locator("#split-go").getAttribute("aria-describedby")).toBe("split-hint");
    await page.locator("#split-go").click();
    expect(await page.locator("#split-go").getAttribute("aria-describedby")).toBeNull();
    await page.close();
  });

  it("with reduced motion the states jump at once and nothing is animating", async () => {
    const page = await open({ reduced: true });
    await page.locator("#split-go").click();
    expect(await stateOf(page)).toBe("split");
    const running = await page.evaluate(() => document.getAnimations()
      // The buttons' own 120ms press feedback is the site's, not this section's (BACKLOG: theme.css .btn under reduced motion).
      .filter((a) => a.playState === "running" && !(a.effect as KeyframeEffect).target?.matches?.(".btn") && (a.effect as KeyframeEffect | null)?.target?.closest?.("#split"))
      .map((a) => `${(a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName} on ${((a.effect as KeyframeEffect).target as Element).className}`));
    expect(running).toEqual([]);
    await page.locator("#split-settle").click();
    expect(await stateOf(page)).toBe("settled");
    await page.close();
  });

  it("without JavaScript the receipt and a plain line with the split numbers are there", async () => {
    const page = await open({ js: false });
    const sec = await text(page, "#split");
    expect(sec).toContain("$312.00");
    expect(sec).toContain("$78.00");
    expect(sec).toContain("$240.00");
    expect(await page.locator("#split-go").isVisible()).toBe(false);
    await page.close();
  });

  it("names no other app, shows no logo of one, and only Maya, Sam and Jo", async () => {
    const page = await open();
    const html = (await page.locator("#split").innerHTML()).toLowerCase();
    for (const other of ["splitwise", "venmo", "tricount", "zelle", "cash app", "paypal"]) expect(html).not.toContain(other);
    expect(await page.locator("#split img").count()).toBe(0);
    const names = ((await page.locator("#split-stubs").textContent()) ?? "").match(/\b(Maya|Sam|Jo)\b/g) ?? [];
    expect(new Set(names)).toEqual(new Set(["Maya", "Sam", "Jo"]));
    await page.close();
  });

  it("at 320px nothing scrolls sideways through the whole thing", async () => {
    const page = await open({ width: 320 });
    await noSideways(page);
    await page.locator("#split-go").click();
    await noSideways(page);
    await page.locator("#split-settle").click();
    await page.waitForFunction(() => document.querySelector("#split-stage")?.getAttribute("data-state") === "settled", null, { timeout: 8000 });
    await noSideways(page);
    await page.close();
  });
});

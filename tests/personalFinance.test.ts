import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";

// Scenarios: features/personal-finance.feature
const ORIGIN = "https://trickortreat.fi";
const TITLE = "Trick or Treat: the personal finance app that shows who you pay";
const DESCRIPTION = "A personal finance app that shows which companies get your money. Try a sample month in your browser. Not investment advice.";
const PLAIN = "Trick or Treat is a personal finance app. See which companies get your money.";
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const out = mkdtempSync(join(tmpdir(), "tot-pf-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const meta = (html: string, key: string): string | undefined =>
  html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];
const footer = (html: string) => html.split("<footer")[1]!.split("</footer>")[0]!;

function jpegSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect([b[0], b[1]]).toEqual([0xff, 0xd8]);
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("no JPEG size marker");
}

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

describe("Feature: the landing page says plainly that Trick or Treat is a personal finance app", () => {
  it("Scenario: The plain line is above the fold", async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base}/index.html`, { waitUntil: "load" });
    const line = page.locator(".hero .hero-plain");
    expect(await line.innerText()).toBe(PLAIN);
    const box = (await line.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    expect(await page.locator("main .hero-copy h1 ~ .hero-plain").count()).toBe(1);
    await page.close();
  });

  it("Scenario: The title and description say it", () => {
    const html = read("index.html");
    expect(html.match(/<title>(.*?)<\/title>/)![1]).toBe(TITLE);
    expect(meta(html, "description")).toBe(DESCRIPTION);
  });

  it("Scenario: A shared link says it", () => {
    const html = read("index.html");
    expect(meta(html, "og:title")).toBe(TITLE);
    expect(meta(html, "twitter:title")).toBe(TITLE);
    expect(meta(html, "og:description")).toBe(DESCRIPTION);
    expect(meta(html, "twitter:description")).toBe(DESCRIPTION);
    expect(meta(html, "og:site_name")).toBe("Trick or Treat");
    expect(meta(html, "twitter:card")).toBe("summary_large_image");
    expect(meta(html, "og:url")).toBe(`${ORIGIN}/`);
    expect(meta(html, "og:image")).toBe(`${ORIGIN}/og.jpg`);
    expect(meta(html, "og:image:alt")).toContain("personal finance app");
    expect([meta(html, "og:image:width"), meta(html, "og:image:height")]).toEqual(["1200", "630"]);
    expect(jpegSize(join(out, "og.jpg"))).toEqual([1200, 630]);
  });

  it("Scenario: The footer explains the domain", () => {
    const text = footer(read("index.html"));
    expect(text).toContain("<p class=\"fp-domain\">Trick or Treat is a personal finance app. .fi is for finance.</p>");
    expect(text).not.toMatch(/Finn(ish|land)/i);
  });

  it("Scenario: The safety words stay", () => {
    const html = read("index.html");
    expect(html).toContain("Not investment advice");
    expect(html).toContain("What it won't ask for");
    expect(html).toContain('<a class="nav-link" href="#slip">what we won\'t ask</a>');
  });

  it("Scenario: The new copy adds no bank ask", () => {
    const step = "Connect your bank. Read-only, via Plaid.";
    for (const p of ["index.html", "about.html"]) {
      const html = read(p);
      // The existing how-it-works step is the only place the phrase appears, unchanged.
      expect(html.match(/connect (your|a) bank/gi) ?? [], p).toHaveLength(1);
      expect(html).toContain(step);
      const added = [html.match(/<title>(.*?)<\/title>/)![1], ...["description", "og:title", "og:description", "og:image:alt", "twitter:title", "twitter:description"].map((k) => meta(html, k)), html.match(/<p class="hero-plain">(.*?)<\/p>/)?.[1] ?? "", html.match(/<p class="fp-domain">(.*?)<\/p>/)?.[1] ?? ""].join(" ");
      expect(added).not.toMatch(/bank|log ?in|account number/i);
      expect(html).not.toMatch(/type="password"|routing number/i);
    }
    expect(read("index.html").match(/class="(?:hero-plain|fp-domain)"/g)).toHaveLength(2);
  });

  it("Scenario: No claim the page cannot back", () => {
    const html = read("index.html");
    expect(html).not.toMatch(/financial advice(?!\b.*not)|guarantee|regulated|for iPhone|on the App Store/i);
  });

  it("Scenario: Nothing new is loaded or sent", () => {
    for (const p of ["index.html", "about.html"]) {
      const html = read(p);
      const hosts = new Set([...html.matchAll(/(?:href|src)="https?:\/\/([^/"]+)/g)].map((m) => m[1]));
      expect([...hosts].filter((h) => h !== "trickortreat.fi" && h !== "subscribe-forms.beehiiv.com")).toEqual([]);
      expect(html).not.toMatch(/googletagmanager|analytics|fonts\.googleapis/i);
    }
  });

  for (const p of ["index.html", "about.html"]) {
    it(`Scenario: The theme control is one icon button showing a sun or a moon (${p})`, async () => {
      const page = await browser.newPage({ colorScheme: "light" });
      await page.goto(`${base}/${p}`, { waitUntil: "load" });
      const btn = page.locator("#theme");
      expect(await btn.evaluate((n) => n.tagName)).toBe("BUTTON");
      for (const attr of ["role", "aria-checked", "aria-pressed"]) expect(await btn.getAttribute(attr), attr).toBeNull();
      expect(await page.locator("#theme .theme-track, #theme .theme-knob").count()).toBe(0);
      const shown = () => btn.evaluate((n) => [...n.querySelectorAll("svg")].filter((v) => getComputedStyle(v).display !== "none").map((v) => v.getAttribute("class")));
      expect(await shown()).toEqual(["ti ti-moon"]);
      expect(await btn.getAttribute("aria-label")).toBe("Switch to dark mode");
      await btn.click();
      expect(await shown()).toEqual(["ti ti-sun"]);
      expect(await btn.getAttribute("aria-label")).toBe("Switch to light mode");
      await btn.click();
      expect(await btn.getAttribute("aria-label")).toBe("Switch to dark mode");
      await page.close();
    });
  }

  it("Scenario: The theme button looks pressable and is easy to use", async () => {
    for (const scheme of ["light", "dark"] as const) {
      const page = await browser.newPage({ colorScheme: scheme });
      await page.goto(`${base}/index.html`, { waitUntil: "load" });
      const btn = page.locator("#theme");
      const box = (await btn.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      const rest = await btn.evaluate((n) => ({ border: getComputedStyle(n).borderTopWidth, shadow: getComputedStyle(n).boxShadow, cursor: getComputedStyle(n).cursor }));
      expect(rest.border).not.toBe("0px");
      expect(rest.shadow).not.toBe("none");
      expect(rest.cursor).toBe("pointer");
      await page.waitForTimeout(200);
      await btn.hover();
      await page.waitForTimeout(250);
      expect(await btn.evaluate((n) => getComputedStyle(n).boxShadow)).not.toBe(rest.shadow);
      await page.mouse.move(0, 0);
      await btn.focus();
      expect(await btn.evaluate((n) => getComputedStyle(n).outlineStyle)).not.toBe("none");
      const before = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
      await page.keyboard.press("Enter");
      const after = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
      expect(after).not.toBe(before);
      await page.keyboard.press("Space");
      expect(await page.evaluate(() => document.documentElement.dataset.theme ?? "")).toBe(before === "" ? (scheme === "dark" ? "dark" : "light") : before);
      await page.close();
    }
  });

  it("Scenario: The theme change respects reduced motion", async () => {
    const still = await browser.newPage({ reducedMotion: "reduce" });
    await still.goto(`${base}/index.html`, { waitUntil: "load" });
    await still.click("#theme");
    expect(await still.locator("#theme .ti").first().evaluate((n) => getComputedStyle(n).animationName)).toBe("none");
    expect(await still.locator("#theme").evaluate((n) => getComputedStyle(n).transitionDuration)).toBe("0s");
    await still.close();
    const moving = await browser.newPage({ reducedMotion: "no-preference" });
    await moving.goto(`${base}/index.html`, { waitUntil: "load" });
    await moving.click("#theme");
    const t = await moving.locator("#theme .ti").first().evaluate((n) => { const c = getComputedStyle(n); return [c.animationName, parseFloat(c.animationDuration) * 1000]; });
    expect(t[0]).toBe("theme-swap");
    expect(t[1] as number).toBeLessThan(300);
    await moving.close();
  });

  it("Scenario: The theme choice is unchanged underneath", async () => {
    const page = await browser.newPage({ colorScheme: "light" });
    await page.goto(`${base}/index.html`, { waitUntil: "load" });
    await page.click("#theme");
    expect(await page.evaluate(() => localStorage.getItem("tot-theme"))).toBe("dark");
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["tot-theme"]);
    await page.close();
  });

  it("Scenario: The about page agrees", () => {
    const html = read("about.html");
    for (const key of ["og:title", "twitter:title", "og:description", "twitter:description"]) expect(meta(html, key), key).toMatch(/personal finance app/);
    expect(html.match(/<title>(.*?)<\/title>/)![1]).toContain("personal finance app");
    expect(meta(html, "og:image")).toBe(`${ORIGIN}/og.jpg`);
  });
});

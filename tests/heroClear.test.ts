import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";

// Scenarios: features/hero-finance-clear.feature (the ones about the home hero and its picture).
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".avif": "image/avif", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
const out = mkdtempSync(join(tmpdir(), "tot-clear-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const PAGES = ["index.html", "about.html", "404.html", "hello-hacker.html"];
const SUBLINE = "Budget, track your spending, and see exactly which companies get your money.";
const KB = 1024;
// Kept in pieces so this file does not contain the removed line itself.
const OLD_LINE = new RegExp(["every swipe", "is a vote"].join(" "), "i");

const lum = (c: string): number => {
  const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
// Reads the first pixel of a PNG screenshot: inflate the IDAT data and skip the filter byte.
const pixel = (png: Buffer): string => {
  let i = 8; const data: Buffer[] = [];
  while (i < png.length) { const len = png.readUInt32BE(i); if (png.toString("ascii", i + 4, i + 8) === "IDAT") data.push(png.subarray(i + 8, i + 8 + len)); i += 12 + len; }
  const raw = inflateSync(Buffer.concat(data));
  return `rgb(${raw[1]}, ${raw[2]}, ${raw[3]})`;
};
// Owner rule: every landing image is transparent. Judged from the file header, per format.
const hasAlpha = (name: string, b: Buffer): boolean =>
  name.endsWith(".png") ? b[25] === 6 || (b[25] === 3 && b.includes("tRNS"))
  : name.endsWith(".webp") ? b.toString("ascii", 12, 16) === "VP8X" && (b[20]! & 0x10) === 0x10
  : name.endsWith(".avif") ? b.includes("auxiliary:alpha")
  : false;
const underBudget = (bytes: number): boolean => bytes <= 150 * KB;

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

const open = async (width: number, scheme: "light" | "dark"): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width, height: 844 }, colorScheme: scheme, reducedMotion: "reduce" });
  await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
  return page;
};

describe("Feature: the hero says personal finance app first and shows the ghost with no card behind it", () => {
  for (const scheme of ["light", "dark"] as const) {
    it(`Scenario: A badge above the headline says what this is (${scheme})`, async () => {
      const page = await open(390, scheme);
      const info = await page.evaluate(() => {
        const hero = document.querySelector(".hero")!;
        const badge = hero.querySelector<HTMLElement>(".hero-badge")!;
        const h1 = document.querySelector("h1")!;
        const c = getComputedStyle(badge);
        const body = getComputedStyle(document.body);
        return {
          text: badge.textContent, tag: badge.tagName, images: badge.querySelectorAll("img, svg").length, inH1: h1.contains(badge),
          before: !!(badge.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING), inHeader: !!badge.closest("header, nav"),
          h1: h1.textContent, size: parseFloat(c.fontSize), weight: Number(c.fontWeight), height: badge.getBoundingClientRect().height,
          line: parseFloat(body.lineHeight) || parseFloat(body.fontSize) * 1.5, fg: c.color, bg: c.backgroundColor, radius: parseFloat(c.borderTopLeftRadius),
        };
      });
      expect(info.text).toBe("Personal finance app");
      expect([info.tag, info.images, info.inH1, info.before, info.inHeader]).toEqual(["P", 0, false, true, false]);
      expect(info.h1).toBe("your receipts already say who you back.");
      expect(info.size).toBeGreaterThanOrEqual(14);
      expect(info.weight).toBeGreaterThanOrEqual(700);
      expect(info.height).toBeGreaterThan(info.line);
      expect(info.radius).toBeGreaterThanOrEqual(info.height / 2 - 1);
      expect(info.bg).toBe(scheme === "light" ? "rgb(61, 220, 132)" : "rgb(61, 220, 132)");
      expect(ratio(info.fg, info.bg)).toBeGreaterThanOrEqual(4.5);
      await page.close();
    });

    it(`Scenario: The sub-line is the plain sentence (${scheme})`, async () => {
      const page = await open(390, scheme);
      const lede = await page.evaluate((text) => {
        const hero = document.querySelector(".hero")!;
        const all = [...hero.querySelectorAll<HTMLElement>("p")].filter((p) => p.textContent === text);
        const el = all[0]!;
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          count: all.length, ledes: hero.querySelectorAll(".hero-lede").length, plains: hero.querySelectorAll(".hero-plain").length,
          afterH1: !!(document.querySelector("h1")!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
          beforeButtons: !!(el.compareDocumentPosition(hero.querySelector(".hero-cta")!) & Node.DOCUMENT_POSITION_FOLLOWING),
          bottom: r.bottom, size: parseFloat(c.fontSize), body: parseFloat(getComputedStyle(document.body).fontSize), fg: c.color, bg: getComputedStyle(document.body).backgroundColor,
        };
      }, SUBLINE);
      expect(lede).toMatchObject({ count: 1, ledes: 1, plains: 0, afterH1: true, beforeButtons: true });
      expect(lede.bottom).toBeLessThanOrEqual(844);
      expect(lede.size).toBeGreaterThan(lede.body);
      expect(ratio(lede.fg, lede.bg)).toBeGreaterThanOrEqual(7);
      const html = read("index.html");
      expect(html).toContain("example numbers. nothing leaves your tab.");
      expect(html).toContain("Not investment advice");
      expect(html.match(/<p class="hero-lede">(.*?)<\/p>/)![1]).not.toMatch(/connect your bank|log ?in|account number|sort/i);
      await page.close();
    });
  }

  it("Scenario: The badge is on the home page only and is not repeated", () => {
    expect(read("index.html").match(/class="hero-badge"/g)).toHaveLength(1);
    for (const p of PAGES.slice(1)) expect(read(p), p).not.toContain("hero-badge");
    for (const p of PAGES) expect(read(p).match(/<h1[ >]/g) ?? [], p).toHaveLength(1);
  });

  it("Scenario: The old line is gone from everywhere", () => {
    const scripts = readdirSync(join(out, "assets")).filter((f) => f.endsWith(".js"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const p of PAGES) expect(read(p), p).not.toMatch(OLD_LINE);
    for (const f of scripts) expect(read(`assets/${f}`), f).not.toMatch(OLD_LINE);
    const sources = [...readdirSync(join(process.cwd(), "src")).filter((f) => /\.(ts|css)$/.test(f)).map((f) => join("src", f)), ...readdirSync(join(process.cwd(), "tests")).filter((f) => f.endsWith(".ts")).map((f) => join("tests", f))];
    expect(sources.length).toBeGreaterThan(20);
    for (const f of sources) expect(readFileSync(join(process.cwd(), f), "utf8"), f).not.toMatch(OLD_LINE);
  });

  it("Scenario: The two old hero lines are replaced, not kept beside the new ones", () => {
    const hero = read("index.html").match(/<section class="hero"[\s\S]*?<\/section>/)![0];
    expect(hero).not.toContain("Trick or Treat is a personal finance app. See which companies get your money.");
    expect(hero).not.toMatch(OLD_LINE);
    expect(hero.match(/class="hero-lede"/g)).toHaveLength(1);
  });

  for (const scheme of ["light", "dark"] as const) for (const width of [390, 1280]) {
    it(`Scenario: The picture has no card behind it (${width}px ${scheme})`, async () => {
      const page = await open(width, scheme);
      const style = await page.locator(".hero-art").evaluate((n) => { const c = getComputedStyle(n); return { bg: c.backgroundColor, img: c.backgroundImage, border: c.borderTopWidth, shadow: c.boxShadow, overflow: c.overflow }; });
      expect(style).toEqual({ bg: "rgba(0, 0, 0, 0)", img: "none", border: "0px", shadow: "none", overflow: "visible" });
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const box = (await page.locator(".hero-art").boundingBox())!;
      for (const [x, y] of [[box.x + 1, box.y + 1], [box.x + box.width - 2, box.y + 1], [box.x + 1, box.y + box.height - 2], [box.x + box.width - 2, box.y + box.height - 2]]) {
        expect(pixel(await page.screenshot({ clip: { x: x!, y: y!, width: 1, height: 1 } })), `corner ${x},${y}`).toBe(bg);
      }
      const img = (await page.locator(".hero-art img").boundingBox())!;
      expect(img.x).toBeGreaterThanOrEqual(-1);
      expect(img.x + img.width).toBeLessThanOrEqual(width + 1);
      await page.close();
    });
  }

  it("Scenario: The picture itself is transparent", async () => {
    const dir = join(out, "hero");
    const files = readdirSync(dir);
    expect(files.filter((f) => /\.jpe?g$/.test(f))).toEqual([]);
    const png = files.filter((f) => f.endsWith(".png"));
    expect(png.length).toBeGreaterThan(0);
    for (const f of png) expect(readFileSync(join(dir, f))[25], f).toBe(6);
    for (const f of files.filter((x) => x.endsWith(".webp"))) { const b = readFileSync(join(dir, f)); expect(b.toString("ascii", 12, 16), f).toBe("VP8X"); expect(b[20]! & 0x10, f).toBe(0x10); }
    for (const f of files.filter((x) => x.endsWith(".avif"))) expect(readFileSync(join(dir, f)).includes("auxiliary:alpha"), f).toBe(true);
    const page = await open(1280, "light");
    const alpha = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
      return { w: c.width, h: c.height, a: [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]].map(([x, y]) => g.getImageData(x!, y!, 1, 1).data[3]) };
    }, "/hero/ghost-receipts-1536.webp");
    expect([alpha.w, alpha.h]).toEqual([1536, 1024]);
    expect(alpha.a).toEqual([0, 0, 0, 0]);
    await page.close();
  });

  it("Scenario: Every served landing image is transparent", () => {
    const served = ["hero", "stage"].filter((d) => existsSync(join(out, d))).flatMap((d) => readdirSync(join(out, d)).map((f) => ({ f: `${d}/${f}`, b: readFileSync(join(out, d, f)) })));
    expect(served.length, "the walk found no landing images").toBeGreaterThanOrEqual(7);
    expect(served.filter(({ f }) => f.startsWith("hero/")).length).toBeGreaterThanOrEqual(7);
    expect(served.filter(({ f, b }) => !hasAlpha(f, b)).map(({ f }) => f)).toEqual([]);
  });

  it("the control: the alpha check rejects an opaque PNG, WebP, AVIF and JPEG", () => {
    const opaquePng = Buffer.alloc(40); opaquePng[25] = 2;
    const opaqueWebp = Buffer.alloc(40); opaqueWebp.write("VP8 ", 12, "ascii");
    expect([hasAlpha("a.png", opaquePng), hasAlpha("a.webp", opaqueWebp), hasAlpha("a.avif", Buffer.from("ftypavif")), hasAlpha("a.jpg", Buffer.alloc(40))]).toEqual([false, false, false, false]);
    const rgba = Buffer.alloc(40); rgba[25] = 6;
    expect(hasAlpha("a.png", rgba)).toBe(true);
  });

  for (const scheme of ["light", "dark"] as const) {
    it(`Scenario: The picture is still small, modern and has a fallback (${scheme})`, async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      const got: { url: string; bytes: number }[] = [];
      page.on("response", async (r) => { if (r.url().includes("/hero/")) got.push({ url: r.url(), bytes: (await r.body()).length }); });
      await page.goto(`${base}/index.html`, { waitUntil: "networkidle" });
      await page.close();
      expect(got).toHaveLength(1);
      expect(underBudget(got[0]!.bytes)).toBe(true);
      const html = read("index.html");
      const picture = html.match(/<picture class="hero-art">([\s\S]*?)<\/picture>/)![1]!;
      expect(picture).toMatch(/type="image\/avif"/);
      expect(picture).toMatch(/type="image\/webp"/);
      expect(picture).toMatch(/<img src="\/hero\/[^"]+\.png"/);
      for (const m of picture.matchAll(/\/hero\/[\w.-]+/g)) expect(existsSync(join(out, m[0])), m[0]).toBe(true);
      expect([...picture.matchAll(/ghost-receipts-(\d+)\.avif/g)].map((m) => Number(m[1]))).toEqual([768, 1152, 1536]);
    });
  }

  it("the control: the weight check fails for a 151 KB file and passes at 150 KB", () => {
    expect(underBudget(151 * KB)).toBe(false);
    expect(underBudget(150 * KB)).toBe(true);
  });
});

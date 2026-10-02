import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";

const BASE = "/landing-page/";
const PAGES = ["index.html", "about.html"];
const WIDTHS = [375, 768, 1280, 1920];
const out = mkdtempSync(join(tmpdir(), "tot-landing-"));

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
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], {
    stdio: "pipe",
  });
  ({ server, base } = await serve(out));
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
}, 120_000);

afterAll(async () => { await browser?.close(); server?.close(); });

describe("build", () => {
  it("emits both pages", () => {
    for (const p of PAGES) expect(existsSync(join(out, p))).toBe(true);
  });
  it("bundles fonts locally, no third-party requests", () => {
    for (const p of PAGES) {
      const html = readFileSync(join(out, p), "utf8");
      expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|<script[^>]+src="https?:/);
    }
    expect(readdirSync(join(out, "assets")).some((f) => f.endsWith(".woff2"))).toBe(true);
  });
});

describe("links", () => {
  for (const p of PAGES) {
    it(`${p}: internal links, anchors and assets resolve under ${BASE}; no app or external links`, () => {
      const html = readFileSync(join(out, p), "utf8");
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
      expect(html).not.toContain("localhost");
      for (const h of hrefs) {
        expect(h.startsWith("http"), h).toBe(false);
        const [path, hash] = h.split("#");
        const rel = path.startsWith(BASE) ? path.slice(BASE.length) : path;
        const file = join(out, rel === "" || rel === "./" ? (path === "" ? p : "index.html") : rel);
        expect(existsSync(file), h).toBe(true);
        if (hash) expect(readFileSync(file, "utf8"), h).toContain(`id="${hash}"`);
      }
    });
    it(`${p}: sign-in is 'Coming soon', not a link`, () => {
      const html = readFileSync(join(out, p), "utf8");
      expect(html).toMatch(/<span class="nav-signin[^"]*"[^>]*>Coming soon<\/span>/);
      expect(html).not.toMatch(/<a[^>]*>\s*(Sign in|See your month)/);
    });
    it(`${p}: favicon and og:image are set`, () => {
      const html = readFileSync(join(out, p), "utf8");
      expect(html).toContain(`href="${BASE}favicon.png"`);
      expect(html).toContain('property="og:image" content="https://trick-or-treat-finance.github.io/landing-page/og.jpg"');
      expect(existsSync(join(out, "og.jpg"))).toBe(true);
    });
    it(`${p}: no false claims, disclaimers present`, () => {
      const text = readFileSync(join(out, p), "utf8");
      expect(text).not.toMatch(/\bcannot\b|can't do|\bFree\b|Invest smarter|put one back|exactly the proportions/i);
      const footer = text.split("<footer")[1]!.split("</footer>")[0]!;
      expect(footer).toContain("the fine print");
      expect(footer).toContain("Not investment advice");
      expect(footer).toMatch(/Sample (data|month)/);
      expect(footer).toContain("not built yet");
      const body = text.split("<footer")[0]!.split("<main")[1]!;
      expect(body).not.toMatch(/not affiliated|Trademarks? of their owners|Not investment advice\./i);
    });
  }
});

describe("index footer fine print", () => {
  const html = () => readFileSync(join(out, "index.html"), "utf8");
  const footer = () => html().split("<footer")[1]!.split("</footer>")[0]!;
  const text = () => footer().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("carries the removed 'Preview.' line word for word", () => {
    expect(text()).toContain("Preview. The investing half is not built yet.");
    expect(html().split("<footer")[0]).not.toContain("Preview. The investing half is not built yet.");
  });
  it("groups the fine print under 3-4 short labels", () => {
    const labels = [...footer().matchAll(/<h3[^>]*class="fp-h"[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]!);
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.length).toBeLessThanOrEqual(4);
    for (const l of labels) expect(l.length).toBeLessThanOrEqual(32);
    expect((footer().match(/<p>/g) ?? []).length).toBe(labels.length);
  });
  it("quick maths: no sample-month eyebrow or September label, meme receipt header, hero art is the receipt drawing", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).not.toContain("Sample month · September");
    expect(html).not.toContain('class="eyebrow">Sample');
    expect(html).toContain("quick maths, no cap");
    expect(html).toContain("this page reads a sample month");
    expect(html).toMatch(/<svg class="hero-art"[^>]*aria-label="[^"]*receipt/);
    expect(html).not.toMatch(/<img class="hero-art"/);
  });
  it("says each fact once: sample month, no storage, not built yet, risk, advice, trademarks", () => {
    const t = text();
    for (const re of [/not built yet/gi, /stores? nothing|nothing is stored/gi, /made-up/gi, /can lose money/gi, /not affiliated with or endorsed by Warren/gi, /trademarks of their owners/gi, /a preview/gi]) {
      expect(t.match(re)?.length, String(re)).toBe(1);
    }
    expect(t).toContain("Nothing leaves this browser and nothing is stored");
    expect(t).toContain("a made-up month that runs in this tab");
    expect(t).toContain("Connecting a bank shares transactions with Trick or Treat through Plaid. Disconnect any time; your data for that bank is deleted after Plaid confirms.");
    expect(t.match(/Sample month\./g)?.length).toBe(1);
    expect(t.match(/Not real data\./g)?.length).toBe(1);
    expect(t.match(/Not investment advice\./gi)?.length).toBe(1);
  });
});

describe("responsive", () => {
  for (const p of PAGES) for (const w of WIDTHS) {
    it(`${p} has no horizontal overflow at ${w}px`, async () => {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.goto(`${base}${BASE}${p}`, { waitUntil: "networkidle" });
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const offenders = [...document.querySelectorAll("body *")]
          .filter((el) => el.getBoundingClientRect().right > de.clientWidth + 1)
          .map((el) => el.tagName + "." + el.className).slice(0, 5);
        return { scroll: de.scrollWidth, client: de.clientWidth, offenders };
      });
      await page.close();
      expect(m.scroll, JSON.stringify(m.offenders)).toBeLessThanOrEqual(m.client);
      expect(m.offenders).toEqual([]);
    });
  }
});

describe("404 page", () => {
  const html = () => readFileSync(join(out, "404.html"), "utf8");
  it("is emitted at the dist root so Pages serves it for unknown paths", () => {
    expect(existsSync(join(out, "404.html"))).toBe(true);
    expect(html()).toContain('name="robots" content="noindex"');
  });
  it("hero is an eager, sized, alt-texted picture with AVIF, WebP and PNG sources that exist", () => {
    const h = html();
    expect(h).toMatch(/<source type="image\/avif"/);
    expect(h).toMatch(/<source type="image\/webp"/);
    const img = h.match(/<img class="nf-art"[^>]*>/)![0];
    expect(img).toMatch(/width="1536"/);
    expect(img).toMatch(/height="1024"/);
    expect(img).toMatch(/loading="eager"/);
    expect(img).toMatch(/alt="[^"]{20,}"/);
    for (const m of h.matchAll(/(?:src|srcset)="([^"]+)"/g))
      for (const part of m[1]!.split(",")) {
        const u = part.trim().split(/\s+/)[0]!;
        if (u.startsWith(`${BASE}404/`)) expect(existsSync(join(out, u.slice(BASE.length))), u).toBe(true);
      }
  });
  it("links home and to the about page with absolute, base-prefixed hrefs", () => {
    expect(html()).toContain(`<a class="btn" href="${BASE}">`);
    expect(html()).toContain(`href="${BASE}about.html"`);
  });
  it("has one h1 and no horizontal overflow at 375/768/1280/1920, light and dark", async () => {
    for (const w of WIDTHS)
      for (const scheme of ["light", "dark"] as const) {
        const page = await browser.newPage({ viewport: { width: w, height: 800 }, colorScheme: scheme });
        await page.goto(`${base}${BASE}404.html`, { waitUntil: "load" });
        expect(await page.locator("h1").count()).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w} ${scheme}`).toBe(true);
        await page.close();
      }
  }, 60_000);
});

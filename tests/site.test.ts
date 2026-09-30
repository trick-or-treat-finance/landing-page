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
      expect(text).toContain("Not investment advice");
      expect(text).toMatch(/Sample (data|month)/);
      expect(text).toContain("not built yet");
    });
  }
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

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stubBeehiiv } from "./beehiiv-stub";
import { chromium, type Browser } from "playwright-core";

const BASE = "/landing-page/";
const PAGES = ["index.html", "about.html"];
const WIDTHS = [320, 375, 768, 1280, 1920];
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
  browser = stubBeehiiv(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }));
}, 120_000);

afterAll(async () => { await browser?.close(); server?.close(); });

describe("build", () => {
  it("emits both pages", () => {
    for (const p of PAGES) expect(existsSync(join(out, p))).toBe(true);
  });
  it("bundles fonts locally, no third-party requests", () => {
    for (const p of PAGES) {
      const html = readFileSync(join(out, p), "utf8");
      expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
      expect([...html.matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("https://subscribe-forms.beehiiv.com/"))).toEqual([]);
    }
    expect(readdirSync(join(out, "assets")).some((f) => f.endsWith(".woff2"))).toBe(true);
  });
});

describe("links", () => {
  for (const p of PAGES) {
    it(`${p}: internal links, anchors and assets resolve under ${BASE}; no app or external links`, () => {
      const html = readFileSync(join(out, p), "utf8");
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((h) => !h.startsWith("https://subscribe-forms.beehiiv.com/"));
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
    it(`${p}: 'Coming soon' pill goes to the email sign-up, there is no sign-in link`, () => {
      const html = readFileSync(join(out, p), "utf8");
      expect(html).toMatch(/<a class="nav-signin" href="[^"]*#notify">Coming soon<\/a>/);
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
      expect(footer).toMatch(/example numbers/i);
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
    const lede = html.match(/<p class="hero-lede">([^<]+)<\/p>/)![1]!;
    expect(lede).not.toMatch(/sample month|receipt|flip the switch/i);
    expect(lede.split(/\s+/).length).toBeLessThanOrEqual(15);
    expect(html).toMatch(/<svg class="hero-art"[^>]*aria-label="[^"]*receipt/);
    expect(html).not.toMatch(/<img class="hero-art"/);
  });
  it("says each fact once: example numbers, no storage, not built yet, risk, advice, trademarks", () => {
    const t = text();
    for (const re of [/not built yet/gi, /nothing is stored/gi, /made-up/gi, /can lose money/gi, /not affiliated with or endorsed by Warren/gi, /trademarks of their owners/gi]) {
      expect(t.match(re)?.length, String(re)).toBe(1);
    }
    expect(t).toContain("Nothing leaves this browser and nothing is stored");
    expect(t).toContain("a made-up month that runs in this tab");
    expect(t).toContain("Connecting a bank shares transactions with Trick or Treat through Plaid. Disconnect any time; your data for that bank is deleted after Plaid confirms.");
    expect(t).not.toMatch(/Sample month\.|SAMPLE DATA/);
    expect(t.match(/Not real data\./g)?.length).toBe(1);
    expect(t.match(/Not investment advice/gi)?.length).toBe(1);
  });
  it("fine print is small and not shouting", () => {
    const css = readFileSync(join(import.meta.dirname, "../src/style.css"), "utf8");
    expect(css).toMatch(/\.site-footer p \{[^}]*font-size: 12px/);
    expect(css).toMatch(/\.fp-h \{[^}]*font-size: 11px/);
    expect(css).not.toMatch(/\.fp-h \{[^}]*uppercase/);
  });
});

describe("how it works", () => {
  const html = () => readFileSync(join(out, "index.html"), "utf8");
  it("is three one-line steps, no 'same number' headline, no transfer-matching paragraph", () => {
    const h = html();
    expect(h).not.toContain("The same number, resorted");
    expect(h).not.toContain("within four days");
    expect(h).not.toContain("The number is arithmetic");
    const list = h.split('class="how-list"')[1]!.split("</ol>")[0]!;
    expect(list.match(/<li[ >]/g)?.length).toBe(3);
    expect(list).not.toContain("<p>");
    for (const m of list.matchAll(/<h3>([^<]+)<\/h3>/g)) expect(m[1]!.length).toBeLessThanOrEqual(48);
  });
});

describe("email sign-up", () => {
  const html = () => readFileSync(join(out, "index.html"), "utf8");
  const BEEHIIV = "https://subscribe-forms.beehiiv.com";
  it("embeds the owner's beehiiv form in #notify, between the lede and the end of the section", () => {
    const sec = html().split('id="notify"')[1]!.split("</section>")[0]!;
    expect(sec).toContain("Be the first to know.");
    expect(sec).toMatch(/<p class="lede">[\s\S]*<script async src="https:\/\/subscribe-forms\.beehiiv\.com\/v3\/loader\.js" data-beehiiv-form="0815b6bf-3f5b-42a1-8bbf-97dbe3917f4f"><\/script>/);
  });
  it("wraps the embed in a 400px-capped container and adds the reassurance line under it", () => {
    const sec = html().split('id="notify"')[1]!.split("</section>")[0]!;
    expect(sec).toMatch(/<div class="cta-embed">\s*<script async src="https:\/\/subscribe-forms\.beehiiv\.com\/v3\/loader\.js"[^>]*><\/script>\s*<\/div>\s*<p class="cta-hint">One email when it opens to everyone\. No spam, unsubscribe any time\.<\/p>/);
    expect(sec).toContain("Your own month is next. Leave your email and we&rsquo;ll tell you when it opens.");
    expect(readFileSync(join(import.meta.dirname, "../src/landing.css"), "utf8")).toMatch(/\.cta-embed \{[^}]*max-width: 400px/);
  });
  it("the only external script is beehiiv's loader, and no Buttondown is left", () => {
    const srcs = [...html().matchAll(/<script[^>]*src="(https?:[^"]+)"/g)].map((m) => m[1]);
    expect(srcs).toEqual([`${BEEHIIV}/v3/loader.js`]);
    expect(html()).not.toMatch(/buttondown/i);
    expect(html()).not.toContain('id="notify-form"');
  });
  it("the fine print says beehiiv handles the sign-up", () => {
    const fp = html().split('id="fp-email"')[1]!.split("</section>")[0]!;
    expect(fp).toMatch(/beehiiv handles your email address/);
  });
  it("sets no Content-Security-Policy, so the one allowed origin is the loader's", () => {
    expect(html()).not.toMatch(/Content-Security-Policy/i);
  });
});

describe("what you get today", () => {
  const sec = () => readFileSync(join(out, "index.html"), "utf8").split('id="today"')[1]!.split("</section>")[0]!;
  it("lists the live items under 'Available right away', soon items under a soon tag, investing under Later", () => {
    const [now, soon, later] = sec().split('class="today-col"').slice(1) as [string, string, string];
    for (const t of ["every purchase", "transactions behind it", "merchant names and logos", "month by month"]) expect(now).toContain(t);
    expect(now).not.toContain("soon-tag");
    expect(soon).toContain('class="soon-tag">soon<');
    for (const t of ["budget", "rewards"]) expect(soon).toContain(t);
    expect(soon).toContain("Not live yet");
    expect(later).toContain("investing");
    for (const t of ["budget", "rewards"]) expect(now + later).not.toContain(t);
  });
});

describe("header pill contrast", () => {
  const lum = (c: string): number => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  for (const p of PAGES) for (const theme of ["light", "dark"] as const) {
    it(`${p} ${theme}: every header pill is at least 4.5:1, resting and hovered`, async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
      await page.goto(`${base}${BASE}${p}`, { waitUntil: "networkidle" });
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      for (const el of await page.locator(".site-nav .nav-link, .site-nav .nav-signin").all()) {
        for (const hover of [false, true]) {
          if (hover) await el.hover();
          await page.waitForTimeout(450);
          const { fg, bg } = await el.evaluate((n) => ({ fg: getComputedStyle(n).color, bg: getComputedStyle(n).backgroundColor }));
          expect(ratio(fg, bg), `${await el.innerText()} ${hover ? "hover" : "rest"} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      await page.close();
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

describe("SOON tag", () => {
  it("the SOON tag looks like the app's: 2px 6px padding, .08em spacing, app track colours", () => {
    const css = readFileSync(join(import.meta.dirname, "../src/landing.css"), "utf8");
    const rule = css.match(/\.soon-tag \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("padding: 2px 6px");
    expect(rule).toContain("letter-spacing: 0.08em");
    expect(rule).toContain("#E3EAE1");
    expect(css).toMatch(/\.soon-tag \{ background: #24423A; \}/);
  });
});

describe("one theme on every page (issue #18)", () => {
  const ALL = ["index.html", "about.html", "404.html", "hello-hacker.html"];
  const src = (f: string) => readFileSync(join(import.meta.dirname, "../src", f), "utf8");
  it("only theme.css declares colour tokens; the app's ground, ink and hard shadow, light and dark", () => {
    const theme = src("theme.css");
    for (const v of ["--ground: #faf8f0", "--ink: #12261f", "--hard: #155646", "--ground: #0e1f1a", "--hard: #3ddc84"]) expect(theme).toContain(v);
    for (const f of ["style.css", "landing.css", "grow.css", "notfound.css"]) expect(src(f), f).not.toMatch(/--(ground|ink|primary):/);
    expect(src("landing.css") + src("notfound.css")).not.toMatch(/#0d0912|#ff8a2b|#ffa04d|140 80 230/i);
  });
  it("every page loads the shared theme and has the same day/night switch", () => {
    expect(src("main.ts")).toContain('import "./theme.css"');
    expect(src("notfound.ts")).toContain('import "./theme.css"');
    for (const p of ALL) expect(readFileSync(join(out, p), "utf8"), p).toMatch(/<button class="theme js-only" id="theme"[^>]*role="switch"/);
  });
  it("the switch is remembered from one page to the next", async () => {
    const page = await browser.newPage({ colorScheme: "light" });
    await page.goto(`${base}${BASE}about.html`, { waitUntil: "load" });
    await page.click("#theme");
    await page.goto(`${base}${BASE}404.html`, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(14, 31, 26)");
    await page.close();
  });
  it("about is short: three one-line steps, two three-line lists, no essay", () => {
    const h = readFileSync(join(out, "about.html"), "utf8");
    const main = h.split("<main")[1]!.split("</main>")[0]!;
    const list = main.split('class="how-list"')[1]!.split("</ol>")[0]!;
    expect(list.match(/<li[ >]/g)?.length).toBe(3);
    for (const m of list.matchAll(/<h3>([^<]+)<\/h3>/g)) expect(m[1]!.length).toBeLessThanOrEqual(48);
    const words = main.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(150);
    expect(main).not.toContain("The name is not decoration");
  });
  it("every page sets the saved theme inline, before any stylesheet or module, so it never flashes", () => {
    for (const p of ALL.flatMap((f) => [join(out, f), join(import.meta.dirname, "..", f)])) {
      const head = readFileSync(p, "utf8").split("</head>")[0]!;
      const inline = head.search(/<script>[^<]*localStorage\.getItem\("tot-theme"\)[^<]*dataset\.theme/);
      expect(inline, p).toBeGreaterThan(-1);
      for (const m of head.matchAll(/<link[^>]*rel="stylesheet"|<style|<script[^>]*type="module"/g)) expect(inline, `${p}: ${m[0]}`).toBeLessThan(m.index!);
    }
  });
  it("a saved dark holds on a light system even before the modules run", async () => {
    const page = await browser.newPage({ colorScheme: "light" });
    await page.goto(`${base}${BASE}about.html`, { waitUntil: "load" });
    await page.evaluate(() => localStorage.setItem("tot-theme", "dark"));
    await page.route("**/*.js", (r) => r.abort());
    for (const p of ALL) {
      await page.goto(`${base}${BASE}${p}`, { waitUntil: "domcontentloaded" });
      expect(await page.evaluate(() => document.documentElement.dataset.theme), p).toBe("dark");
    }
    await page.close();
  });
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: the small text on a tile is at least 4.5:1`, async () => {
      const lum = (c: string): number => {
        const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const page = await browser.newPage({ colorScheme: theme });
      await page.goto(`${base}${BASE}index.html`, { waitUntil: "load" });
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      const pairs = await page.locator(".tile small").evaluateAll((ns) => ns.map((n) => ({ fg: getComputedStyle(n).color, bg: getComputedStyle(n.closest(".tile")!).backgroundColor })));
      expect(pairs.length).toBeGreaterThan(0);
      for (const { fg, bg } of pairs) {
        const [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p);
        expect((x! + 0.05) / (y! + 0.05), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      await page.close();
    });
  }
});

// Issue #20: the October receipt line was covered by the row below it, and "how it works" landed under the sticky header.
describe("issue #20", () => {
  const SIZES = [[320, 800], [390, 844], [768, 1024], [1440, 900], [1536, 999]] as const;
  for (const [w, h] of SIZES) for (const theme of ["light", "dark"] as const) {
    it(`${w}x${h} ${theme}: "Fun-size, 12 pack" and its note are fully visible, Trick and Treat`, async () => {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`${base}${BASE}index.html?october`, { waitUntil: "load" });
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      for (const view of ["trick", "treat"]) {
        if (view === "treat") { await page.click("#sw"); await page.waitForTimeout(600); }
        const r = await page.evaluate(() => {
          const slot = document.querySelector<HTMLElement>(".slot.oct")!;
          slot.scrollIntoView({ block: "center" });
          const s = slot.getBoundingClientRect();
          return [slot.querySelector(".nm")!, slot.querySelector(".oct-note")!].map((el) => {
            const b = el.getBoundingClientRect();
            const hit = (x: number, y: number) => el.contains(document.elementFromPoint(x, y));
            return { inside: b.top >= s.top - 1 && b.bottom <= s.bottom + 1, seen: [0.05, 0.5, 0.95].every((f) => hit(b.left + b.width * f, b.top + b.height / 2)) };
          });
        });
        expect(r, view).toEqual([{ inside: true, seen: true }, { inside: true, seen: true }]);
      }
      await page.close();
    });
    it(`${w}x${h} ${theme}: "how it works" lands with its heading below the sticky header`, async () => {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: theme });
      await page.goto(`${base}${BASE}index.html`, { waitUntil: "load" });
      const link = page.locator('.site-nav a[href$="#how"]');
      if (await link.isVisible()) await link.click();
      else await page.goto(`${base}${BASE}about.html#how`);
      await page.waitForURL(/about\.html#how$/);
      await page.waitForLoadState("load");
      await page.waitForTimeout(300);
      const { header, eyebrow } = await page.evaluate(() => ({
        header: document.querySelector(".site-header")!.getBoundingClientRect().bottom,
        eyebrow: document.querySelector("#how .eyebrow")!.getBoundingClientRect().top,
      }));
      expect(eyebrow, `eyebrow top ${eyebrow} vs header bottom ${header}`).toBeGreaterThanOrEqual(header);
      await page.close();
    });
  }
});

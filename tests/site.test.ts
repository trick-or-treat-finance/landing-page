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
    expect(list.match(/<li>/g)?.length).toBe(3);
    for (const m of list.matchAll(/<p>([^<]+)<\/p>/g)) expect(m[1]!.length).toBeLessThanOrEqual(80);
  });
});

describe("about page is short and scannable", () => {
  const html = () => readFileSync(join(out, "about.html"), "utf8");
  const main = () => html().split("<main")[1]!.split("</main>")[0]!;
  const words = (h: string) => h.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  it("drops the resorted figure, the trick/treat dollar block and the long essay", () => {
    const h = html();
    expect(h).not.toMatch(/resorted/i);
    expect(h).not.toMatch(/\$4,449|\$2,48[89]|\$100\.00|class="stats?"/);
    expect(h).not.toMatch(/THE LOGO ALREADY SAYS IT|WHY THE ORDER MATTERS|whole argument/i);
  });
  it("has one catchy line: a short headline and a lede under 15 words", () => {
    const h = html();
    expect(h.match(/<h1/g)?.length).toBe(1);
    expect(words(h.match(/<h1[^>]*>([^<]+)<\/h1>/)![1]!)).toBeLessThanOrEqual(8);
    expect(words(h.match(/<p class="about-lede">([^<]+)<\/p>/)![1]!)).toBeLessThanOrEqual(15);
  });
  it("is three short steps: connect, see where every swipe went, budget and rewards soon", () => {
    const list = html().split('class="how-list"')[1]!.split("</ol>")[0]!;
    expect(list.match(/<li>/g)?.length).toBe(3);
    expect(list).toMatch(/Connect/);
    expect(list).toMatch(/every swipe/i);
    expect(list).toMatch(/budget/i);
    expect(list).toMatch(/rewards/i);
    expect(list).toContain('class="soon-tag">soon<');
    for (const m of list.matchAll(/<p>([^<]+)<\/p>/g)) expect(m[1]!.length).toBeLessThanOrEqual(80);
  });
  it("has one short 'what it will never do' list with an anchor for the nav", () => {
    const sec = main().split('id="limits"')[1]!.split("</section>")[0]!;
    const items = sec.match(/<li>/g) ?? [];
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.length).toBeLessThanOrEqual(5);
    expect(sec).toMatch(/never do/i);
  });
  it("the whole page body is under 150 words", () => {
    expect(words(main())).toBeLessThanOrEqual(150);
  });
  it("keeps the legal lines: plaid, no advice, risk, trademarks, not built yet, example numbers", () => {
    const f = html().split("<footer")[1]!.split("</footer>")[0]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const t of ["Not real data.", "not built yet", "Not investment advice", "Investing carries risk", "trademarks of their owners", "not affiliated with or endorsed by any company shown", "Connecting a bank shares transactions with Trick or Treat through Plaid. Disconnect any time; your data for that bank is deleted after Plaid confirms."])
      expect(f, t).toContain(t);
  });
  for (const theme of ["light", "dark"] as const) it(`renders in ${theme} with readable text and no overflow at 375 and 1280`, async () => {
    for (const w of [375, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 }, colorScheme: theme });
      await page.goto(`${base}${BASE}about.html`, { waitUntil: "networkidle" });
      await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
      const m = await page.evaluate(() => {
        const px = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const bg = px(getComputedStyle(document.body).backgroundColor);
        const rows = [...document.querySelectorAll(".about-main h1, .about-main h2, .about-main h3, .about-main p, .about-main li")].map((el) => ({ fg: px(getComputedStyle(el).color), t: el.textContent!.slice(0, 20) }));
        return { bg, rows, over: document.documentElement.scrollWidth > innerWidth };
      });
      await page.close();
      expect(m.over, `${theme} ${w}`).toBe(false);
      for (const r of m.rows) expect(r.fg.join() !== m.bg.join(), `${theme} ${w} ${r.t}`).toBe(true);
    }
  }, 30_000);
});

describe("email sign-up", () => {
  const html = () => readFileSync(join(out, "index.html"), "utf8");
  it("has one email field, a button, the one-line promise and a fine print link, and nothing else", () => {
    const form = html().split('id="notify-form"')[1]!.split("</form>")[0]!;
    expect(form.match(/<input(?![^>]*type="hidden")/g)?.length).toBe(1);
    expect(form).toMatch(/type="email"/);
    expect(form).toMatch(/Unsubscribe any time/);
    expect(form).toContain('href="#fine-print"');
    expect(html()).toMatch(/<form[^>]*method="post"[^>]*action=/);
  });
  it("adds no third-party script", () => {
    expect(html()).not.toMatch(/<script[^>]*src="https?:/);
  });
  it("points at Buttondown's embed-subscribe endpoint with one placeholder username", () => {
    expect(html()).toMatch(/<form[^>]*method="post"[^>]*action="https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\/YOUR-BUTTONDOWN-USERNAME"/);
    expect(html()).toContain('name="email"');
    expect(html()).toMatch(/check your inbox/i);
  });
  const open = async (user: string) => {
    const page = await browser.newPage();
    await page.route("**/index.html", async (r) => {
      const res = await r.fetch();
      await r.fulfill({ status: 200, contentType: "text/html", body: (await res.text()).replaceAll("YOUR-BUTTONDOWN-USERNAME", user) });
    });
    await page.context().route("https://buttondown.com/**", (r) => r.fulfill({ status: 200, body: "ok" }));
    await page.goto(`${base}${BASE}index.html`, { waitUntil: "networkidle" });
    return page;
  };
  it("is disabled, with no thank-you, while the username is still the placeholder", async () => {
    const page = await open("YOUR-BUTTONDOWN-USERNAME");
    expect(await page.locator(".notify-btn").isDisabled()).toBe(true);
    expect(await page.locator("#notify-email").isDisabled()).toBe(true);
    expect(await page.locator("#notify-wait").isVisible()).toBe(true);
    expect(await page.locator("#notify-thanks").isVisible()).toBe(false);
    await page.close();
  });
  it("when configured: errors on a bad email, posts only email+embed natively, then says what happens next", async () => {
    const page = await open("owner");
    expect(await page.locator(".notify-btn").isDisabled()).toBe(false);
    await page.fill("#notify-email", "nope");
    await page.click(".notify-btn");
    expect(await page.locator("#notify-err").isVisible()).toBe(true);
    expect(await page.locator("#notify-thanks").isVisible()).toBe(false);
    await page.fill("#notify-email", "a@b.co");
    const popup = page.waitForEvent("popup");
    const req = page.context().waitForEvent("request", (q) => q.url().startsWith("https://buttondown.com/"));
    await page.click(".notify-btn");
    const sent = await req;
    expect(sent.url()).toBe("https://buttondown.com/api/emails/embed-subscribe/owner");
    expect(sent.method()).toBe("POST");
    expect(sent.postData()).toBe("embed=1&email=a%40b.co");
    await (await popup).close();
    expect(await page.locator("#notify-thanks").isVisible()).toBe(true);
    await page.close();
  }, 20_000);
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

describe("sign-up form and SOON tag", () => {
  it("the sign-up form opens Buttondown in a new tab without handing it this page", () => {
    const html = readFileSync(join(out, "index.html"), "utf8");
    const form = html.match(/<form[^>]*id="notify-form"[^>]*>/)?.[0] ?? "";
    expect(form).toContain('target="_blank"');
    expect(form).toContain('rel="noopener noreferrer"');
  });
  it("the SOON tag looks like the app's: 2px 6px padding, .08em spacing, app track colours", () => {
    const css = readFileSync(join(import.meta.dirname, "../src/landing.css"), "utf8");
    const rule = css.match(/\.soon-tag \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("padding: 2px 6px");
    expect(rule).toContain("letter-spacing: 0.08em");
    expect(rule).toContain("#E3EAE1");
    expect(css).toMatch(/\.soon-tag \{ background: #2A1F36; \}/);
  });
});

describe("about page theme", () => {
  it("the how-it-works page follows dark mode like the home page", () => {
    const html = readFileSync(join(out, "about.html"), "utf8");
    expect(html).toMatch(/<body class="[^"]*\bhome\b[^"]*">/);
  });
});

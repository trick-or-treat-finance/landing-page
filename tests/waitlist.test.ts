// features/own-waitlist.feature: the email form posts to our own list when the site is built with its address.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page, type Route } from "playwright-core";
import { stubBeehiiv } from "./beehiiv-stub";

const BASE = "/landing-page/";
const LEADS = "https://leads.invalid/leads";
const TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".avif": "image/avif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff",
};

function build(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), "tot-wl-"));
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe", env: { ...process.env, ...env } });
  return out;
}
function serve(root: string): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]));
    const rel = path.startsWith(BASE) ? path.slice(BASE.length - 1) : null;
    const file = rel === null ? "" : join(root, rel.endsWith("/") ? rel + "index.html" : rel);
    if (rel === null || !file.startsWith(root) || !existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}${BASE}` })));
}

let browser: Browser;
const servers: Server[] = [];
let ours = "", plain = "";
beforeAll(async () => {
  const [a, b] = [build({ VITE_LEADS_URL: LEADS }), build({ VITE_LEADS_URL: "" })];
  const [sa, sb] = [await serve(a), await serve(b)];
  servers.push(sa.server, sb.server);
  ours = sa.base; plain = sb.base;
  browser = stubBeehiiv(await chromium.launch({ executablePath: process.env.CHROMIUM_PATH }));
}, 180_000);
afterAll(async () => { await browser?.close(); servers.forEach((s) => s.close()); }, 60_000);

type Answer = number | "abort";
async function open(base: string, answer: Answer = 202) {
  const page = await browser.newPage();
  const posts: { method: string; body: string | null }[] = [];
  const foreign: string[] = [];
  await page.route(`${LEADS}**`, (route: Route) => {
    posts.push({ method: route.request().method(), body: route.request().postData() });
    if (answer === "abort") return route.abort();
    return route.fulfill({ status: answer, contentType: "application/json", body: "{}" });
  });
  page.on("request", (r) => { if (!r.url().startsWith(new URL(base).origin) && !r.url().startsWith("data:")) foreign.push(r.url()); });
  await page.goto(base, { waitUntil: "networkidle" });
  return { page, posts, foreign };
}
async function submit(page: Page, text: string) {
  await page.fill("#lead-email", text);
  await page.click(".lead-form button[type=submit]");
}
const status = (page: Page) => page.locator("#lead-status").innerText();

describe("built for our own list", () => {
  it("makes no request until the visitor submits", async () => {
    const { page, posts, foreign } = await open(ours);
    await page.click("#notify-open");
    expect(await page.locator("#lead-email").isVisible()).toBe(true);
    expect(posts).toEqual([]);
    expect(foreign.filter((u) => !u.startsWith(LEADS))).toEqual([]);
    await page.close();
  });

  it("submitting posts the address once and says we email once", async () => {
    const { page, posts } = await open(ours);
    await page.click("#notify-open");
    await submit(page, " Maya@Example.com ");
    await page.waitForFunction(() => document.querySelector("#lead-status")?.textContent?.includes("once"));
    expect(posts).toHaveLength(1);
    expect(posts[0]!.method).toBe("POST");
    expect(JSON.parse(posts[0]!.body!)).toEqual({ email: "Maya@Example.com", source: "landing", website: "" });
    expect(await status(page)).toContain("email you once");
    expect(await page.locator("#lead-email").count()).toBe(0);
    await page.close();
  });

  it("does not send something that is not an address, and keeps what was typed", async () => {
    const { page, posts } = await open(ours);
    await page.click("#notify-open");
    await submit(page, "nope");
    expect(await status(page)).toContain("doesn't look like an email");
    expect(posts).toEqual([]);
    expect(await page.inputValue("#lead-email")).toBe("nope");
    await page.close();
  });

  for (const [answer, words] of [[429, "try again"], [422, "doesn't look like an email"], [500, "couldn't reach"], ["abort", "couldn't reach"]] as const) {
    it(`says so when the list answers ${answer}, and lets the visitor try again`, async () => {
      const { page, posts } = await open(ours, answer);
      await page.click("#notify-open");
      await submit(page, "maya@example.com");
      await page.waitForFunction(() => (document.querySelector("#lead-status")?.textContent ?? "") !== "");
      expect(await status(page)).toContain(words);
      expect(posts).toHaveLength(1);
      expect(await page.locator(".lead-form button[type=submit]").isDisabled()).toBe(false);
      await page.close();
    });
  }

  it("has a hidden box named website, out of sight and out of the tab order", async () => {
    const { page } = await open(ours);
    await page.click("#notify-open");
    const trap = page.locator("input[name=website]");
    expect(await trap.getAttribute("tabindex")).toBe("-1");
    expect(await trap.getAttribute("aria-hidden")).toBe("true");
    // Playwright counts a 1px box as visible; "out of sight" is that it lies wholly off the left edge.
    const box = (await trap.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(0);
    await page.close();
  });

  it("the fine print says we email once and no longer names a newsletter service", async () => {
    const { page } = await open(ours);
    const fp = (await page.locator("#fp-email + p").innerText()).toLowerCase();
    expect(fp).toContain("email you once when we launch");
    expect(fp).not.toContain("beehiiv");
    await page.close();
  });
});

describe("built without the address of our own list", () => {
  it("loads the old sign-up and posts nothing to our list", async () => {
    const { page, posts } = await open(plain);
    await page.click("#notify-open");
    await page.waitForResponse((r) => r.url().startsWith("https://subscribe-forms.beehiiv.com/"));
    expect(posts).toEqual([]);
    expect(await page.locator("#lead-email").count()).toBe(0);
    expect(await page.locator("#fp-email + p").innerText()).toContain("beehiiv");
    await page.close();
  });
});

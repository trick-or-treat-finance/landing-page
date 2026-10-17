// features/waitlist-consent.feature: the email form shows the consent, requires it, and sends it to our list only.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page, type Route } from "playwright-core";

const BASE = "/";
const LEADS = "https://leads.invalid/leads";
// waitlist-1 in the backend's docs/waitlist.md; the page must show this and nothing else as the consent.
const CONSENT = "I agree to be emailed once when this launches, and I can leave the list from the link in that email.";
const TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".avif": "image/avif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".woff": "font/woff",
};

function build(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), "tot-consent-"));
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
}, 180_000);
afterAll(async () => { await browser?.close(); servers.forEach((s) => s.close()); }, 60_000);

type Answer = { status: number; body: string } | "abort";
const OK: Answer = { status: 202, body: "{}" };
async function open(base: string, answer: Answer = OK) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(4000);
  const posts: { method: string; body: string | null }[] = [];
  const foreign: string[] = [];
  const own = new URL(base).origin;
  // Nothing leaves the machine: our list is answered here, every other site is refused but still recorded.
  await context.route((url) => url.origin !== own && !url.href.startsWith("data:"), (route: Route) => {
    const url = route.request().url();
    if (!url.startsWith(LEADS)) { foreign.push(url); return route.abort(); }
    posts.push({ method: route.request().method(), body: route.request().postData() });
    if (answer === "abort") return route.abort();
    return route.fulfill({ status: answer.status, contentType: "application/json", body: answer.body });
  });
  await page.goto(base, { waitUntil: "load" });
  return { page, posts, foreign };
}
async function openForm(page: Page) {
  await page.click("#notify-open");
  await page.locator("#lead-email").waitFor();
}
const consentBox = (page: Page) => page.getByRole("checkbox", { name: CONSENT, exact: true });
const submitButton = (page: Page) => page.locator("form button[type=submit]");
async function type(page: Page, text: string) { await page.fill("#lead-email", text); }
async function submit(page: Page) { await submitButton(page).click(); }
// What a screen reader would be told: any alert or status region, plus the box's own description.
const spoken = (page: Page) => page.locator("[role=alert], [role=status]").allInnerTexts().then((t) => t.join(" ").trim());

describe("the consent on the form", () => {
  it("is a checkbox labelled with the exact words, and unchecked on load", async () => {
    const { page } = await open(ours);
    await openForm(page);
    expect(await consentBox(page).count()).toBe(1);
    expect(await consentBox(page).isChecked()).toBe(false);
    expect(await consentBox(page).isVisible()).toBe(true);
    await page.close();
  });

  it("without it ticked sends nothing and says, in a way that can be read aloud, to agree", async () => {
    const { page, posts } = await open(ours);
    await openForm(page);
    await type(page, "maya@example.com");
    await submit(page);
    await page.waitForFunction(() => /agree|consent/i.test(document.querySelector("[role=alert], [role=status]")?.textContent ?? ""));
    expect(posts).toEqual([]);
    expect(await spoken(page)).toMatch(/agree|consent/i);
    expect(await consentBox(page).isChecked()).toBe(false);
    expect(await page.inputValue("#lead-email")).toBe("maya@example.com");
    // Not a dead end: ticking and sending again goes through.
    await consentBox(page).check();
    await submit(page);
    await page.waitForFunction(() => document.querySelector("#lead-email") === null);
    expect(posts).toHaveLength(1);
    await page.close();
  });

  it("with it ticked posts exactly the contract to our list, consent as the boolean true", async () => {
    const { page, posts } = await open(ours);
    await openForm(page);
    await type(page, " Maya@Example.com ");
    await consentBox(page).check();
    await submit(page);
    await page.waitForFunction(() => document.querySelector("#lead-email") === null);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.method).toBe("POST");
    expect(JSON.parse(posts[0]!.body!)).toEqual({ email: "Maya@Example.com", source: "landing", consent: true, website: "" });
    await page.close();
  });
});

describe("no third party", () => {
  for (const [name, getBase] of [["built for our own list", () => ours], ["built without the address of our list", () => plain]] as const) {
    it(`${name}: reading, opening and submitting asks nothing of beehiiv or any other site`, async () => {
      const { page, posts, foreign } = await open(getBase());
      await page.click("#notify-open");
      await page.waitForTimeout(500);
      if (await consentBox(page).count()) {
        await type(page, "maya@example.com");
        await consentBox(page).check();
        await submit(page);
        await page.waitForTimeout(300);
      }
      expect(foreign).toEqual([]);
      expect(posts.every((p) => p.method === "POST")).toBe(true);
      await page.close();
    });
  }
});

describe("a refusal from the list", () => {
  for (const body of [
    JSON.stringify({ detail: "SERVER-WORDS-7f3a please agree, id 4242" }),
    "<html>SERVER-WORDS-7f3a</html>",
  ]) {
    it(`shows an error without echoing the server's body (${body.slice(0, 12)}...)`, async () => {
      const { page, posts } = await open(ours, { status: 422, body });
      await openForm(page);
      await type(page, "maya@example.com");
      await consentBox(page).check();
      await submit(page);
      await page.waitForFunction(() => (document.querySelector("[role=alert], [role=status]")?.textContent ?? "") !== "");
      expect(posts).toHaveLength(1);
      expect(await spoken(page)).not.toBe("");
      expect(await page.locator("body").innerText()).not.toContain("SERVER-WORDS-7f3a");
      expect(await page.content()).not.toContain("SERVER-WORDS-7f3a");
      expect(await submitButton(page).isDisabled()).toBe(false);
      await page.close();
    });
  }
});

describe("control: already true on main", () => {
  it("something that is not an address is still not sent, and what was typed is kept", async () => {
    const { page, posts } = await open(ours);
    await openForm(page);
    await type(page, "nope");
    await submit(page);
    expect(await page.locator("#lead-status").innerText()).toContain("doesn't look like an email");
    expect(posts).toEqual([]);
    expect(await page.inputValue("#lead-email")).toBe("nope");
    await page.close();
  });
});

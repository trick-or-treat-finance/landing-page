import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// The site is served at https://trickortreat.fi, so nothing may still point at the old project path.
const ORIGIN = "https://trickortreat.fi";
const out = mkdtempSync(join(tmpdir(), "tot-root-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

beforeAll(() => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
}, 120_000);

describe("Given the site is served at the root of trickortreat.fi", () => {
  it("then no built page, script or style mentions the old /landing-page/ path", () => {
    const text = files(out).filter((f) => /\.(html|js|css|txt|xml)$/.test(f));
    expect(text.length).toBeGreaterThan(5);
    expect(text.filter((f) => readFileSync(f, "utf8").includes("/landing-page/"))).toEqual([]);
  });
  it("then assets are absolute from the root", () => {
    expect(read("index.html")).toMatch(/src="\/assets\/[^"]+\.js"/);
    expect(read("404.html")).toContain('href="/"');
  });
  for (const [page, path] of [["index.html", "/"], ["about.html", "/about.html"]] as const) {
    it(`then ${page} names its own canonical and og:url`, () => {
      const html = read(page);
      expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${path}" />`);
      expect(html).toContain(`<meta property="og:url" content="${ORIGIN}${path}" />`);
    });
  }
  it("then the sitemap lists the home and about pages and robots.txt points to it", () => {
    const locs = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([`${ORIGIN}/`, `${ORIGIN}/about.html`]);
    expect(read("robots.txt")).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Scenario: No user-facing "sort" word on any page or toast (features/hero-ghost-3d.feature)
const out = mkdtempSync(join(tmpdir(), "tot-nosort-"));
// Whole words only: sorry and assorted pass. A method call such as .sort( or sort( is code, not copy.
const SORT = /(?<![.\w])sort(?:s|ed|ing)?\b(?!\()/gi;
const read = (p: string) => readFileSync(join(out, p), "utf8");
const pages = ["index.html", "about.html", "404.html", "hello-hacker.html"];

beforeAll(() => { execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" }); }, 120_000);

describe("Feature: no user-facing sort word", () => {
  it("Scenario: No user-facing \"sort\" word on any page or toast", () => {
    const scripts = readdirSync(join(out, "assets")).filter((f) => f.endsWith(".js"));
    const sources = [...pages.map((p) => [p, read(p).replace(/<style[\s\S]*?<\/style>/g, "")] as const), ...scripts.map((f) => [`assets/${f}`, read(`assets/${f}`)] as const)];
    const all = sources.map(([, t]) => t).join("\n");
    // The read must examine something: known words from the pages and from the toasts.
    expect(all).toMatch(/treat/i);
    expect(all).toMatch(/receipt/i);
    expect(all).toContain("trick side. back to what it cost.");
    expect(scripts.length).toBeGreaterThan(0);
    for (const [name, text] of sources) expect(text.match(SORT) ?? [], name).toEqual([]);
  });

  it("the check does flag the words and spares sorry and assorted", () => {
    for (const bad of ["sorted by company", "new sort.", "Sorting machine", "it sorts"]) expect(bad.match(SORT), bad).not.toBeNull();
    for (const ok of ["sorry", "assorted", "list.sort((a, b) => a - b)", "resort"]) expect(ok.match(SORT) ?? [], ok).toEqual([]);
  });
});

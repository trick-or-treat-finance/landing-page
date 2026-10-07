/**
 * `npm run test:changed` trusts vitest's import graph only for modules whose own tests
 * import them. These pin which changes must widen it to the full suite.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(REPO, "scripts", "test-changed.mjs");

type Plan = { full: boolean; reasons: { file: string; why: string }[] };
const { plan } = (await import(pathToFileURL(SCRIPT).href)) as { plan: (changed: string[]) => Plan };

describe("test:changed plan", () => {
  it.each([
    ["src/engine/grow.ts"],
    ["src/grow-view.ts"],
    ["src/eggs.ts"],
    ["src/typewriter.ts"],
    ["tests/engine/month.test.ts"],
  ])("trusts the import graph for %s", (file) => {
    expect(plan([file]).full).toBe(false);
  });

  it.each([
    ["src/render.ts", "page code"],
    ["src/theme.ts", "page code"],
    ["src/style.css", "page code"],
    ["src/engine/notes.md", "not a module"],
    ["tests/beehiiv-stub.ts", "test helper"],
    ["index.html", "outside src/"],
    ["vite.config.ts", "outside src/"],
    ["package.json", "outside src/"],
    ["scripts/serve.mjs", "outside src/"],
    ["README.md", "outside src/"],
  ])("runs everything for %s", (file, why) => {
    const result = plan(["src/engine/grow.ts", file]);
    expect(result.full).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]?.file).toBe(file);
    expect(result.reasons[0]?.why).toContain(why);
  });

  it("runs nothing extra when nothing changed", () => {
    expect(plan([])).toEqual({ full: false, reasons: [] });
  });
});

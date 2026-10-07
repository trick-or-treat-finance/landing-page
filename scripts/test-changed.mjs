/**
 * Run only the tests a change can reach; fall back to the full suite for everything else.
 *
 *     npm run test:changed                  # against origin/main
 *     BASE=feature/epic npm run test:changed
 *
 * The change is `git diff --name-only $BASE...HEAD` plus uncommitted edits, never a
 * hand-picked list. Vitest's own `--changed` then picks the test files that import a
 * changed file, following the import graph.
 *
 * Most tests here build the whole site and drive it in a browser: they import no page
 * code, so the import graph cannot connect a page change to them. Only the modules below
 * have tests that import them; a change anywhere else (pages, CSS, render, theme, config,
 * scripts, docs, test helpers) runs the whole suite. Vitest does the same on its own for
 * its config and package.json; this says so out loud and does not depend on it.
 *
 * The full suite (`npm test`) is still the gate for an epic branch merging to main.
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Modules whose own tests import them: the import graph can be trusted with these. */
export const FEATURES = [
  "src/engine/", // tests/engine, tests/grow-view.test.ts
  "src/grow-view.ts",
  "src/eggs.ts",
  "src/typewriter.ts",
];

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST = /^tests\/.*\.test\.ts$/;

/**
 * Why a changed file forces the full suite, or null when the import graph can be trusted
 * with it.
 */
export function fullSuiteReason(file) {
  if (TEST.test(file)) return null;
  if (FEATURES.some((prefix) => file.startsWith(prefix))) {
    return CODE.test(file) ? null : "not a module (the import graph cannot see it)";
  }
  if (file.startsWith("tests/")) return "test helper (shared by the browser tests)";
  if (file.startsWith("src/")) return "page code (the browser tests build the whole site and import none of it)";
  return "outside src/ (pages, config, scripts or docs: the build and the tests read these)";
}

/** Decide from the list of changed files. */
export function plan(changed) {
  const reasons = changed
    .map((file) => ({ file, why: fullSuiteReason(file) }))
    .filter((r) => r.why !== null);
  return { full: reasons.length > 0, reasons };
}

function git(...args) {
  const out = spawnSync("git", args, { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${out.stderr.trim()}`);
  return out.stdout.split("\n").filter(Boolean);
}

function vitest(args, opts = {}) {
  return spawnSync("npx", ["vitest", ...args], { encoding: "utf8", ...opts });
}

function main() {
  const base = process.env.BASE || "origin/main";
  let changed;
  try {
    git("rev-parse", "--verify", "--quiet", `${base}^{commit}`);
    changed = [
      ...new Set([
        ...git("diff", "--name-only", `${base}...HEAD`),
        ...git("diff", "--name-only", "HEAD"), // staged and unstaged
        // New files not yet added. Only under src/ and tests/: a worktree's node_modules symlink is
        // untracked and not ignored, and would force the full suite on every run.
        ...git("ls-files", "--others", "--exclude-standard", "--", "src/", "tests/"),
      ]),
    ].sort();
  } catch (error) {
    console.error(`test:changed: cannot diff against BASE=${base}: ${error.message}`);
    process.exit(2);
  }

  console.log(`test:changed: ${changed.length} file(s) changed against ${base}`);
  for (const file of changed) console.log(`  ${file}`);

  const { full, reasons } = plan(changed);
  if (full) {
    console.log("\nFull suite, because:");
    for (const { file, why } of reasons) console.log(`  ${file}: ${why}`);
    process.exit(vitest(["run"], { stdio: "inherit" }).status ?? 1);
  }

  const listed = vitest(["list", "--changed", base, "--filesOnly"]);
  if (listed.status !== 0) {
    process.stderr.write(listed.stdout + listed.stderr);
    process.exit(listed.status ?? 1);
  }
  const picked = listed.stdout.split("\n").map((l) => l.trim()).filter((l) => /\.test\.ts$/.test(l));
  if (picked.length === 0) {
    console.log("\nNo test file imports a changed file. Nothing to run.");
    process.exit(0);
  }
  console.log(`\n${picked.length} test file(s) picked, because each imports a changed file (vitest --changed ${base}):`);
  for (const file of picked) console.log(`  ${file}`);
  process.exit(vitest(["run", ...picked], { stdio: "inherit" }).status ?? 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

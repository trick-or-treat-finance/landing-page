// @vitest-environment node
/** features/test-integrity.feature: each scenario runs the script against a real git repository in a temp dir. */

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(resolve(dirname(new URL(import.meta.url).pathname), ".."), "scripts", "check-test-integrity.sh");
const DIR = "tests";
const EXISTING = `${DIR}/budget.test.ts`;
const NEW = `${DIR}/new.test.ts`;

// Each marker is split in two so this file does not itself add one: the check reads every
// added line of a test file, this one included.
const MARKERS: Record<string, string> = {
  "a pytest skip mark": "@pytest.mark." + "skip",
  "a pytest xfail mark": "@pytest.mark." + "xfail",
  "a vitest only": "it." + "only('x', () => {});",
  "a describe skip": "describe." + "skip('x', () => {});",
  "a test skip": "test." + "skip('x', () => {});",
  "an XCTest skip": "throw XCT" + "Skip('later')",
  "a disabled trait": "@Test(." + "disabled()) func later() {}",
};

// Isolated from the machine's git config: a global hook or signing rule is not the fixture.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};
let repo: string;
let commits: string[];

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, env: GIT_ENV, stdio: "pipe", encoding: "utf8" }).trim();
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = (message = "Add the budget view") => {
  git("add", "-A");
  git("commit", "-q", "-m", message);
  commits.push(git("rev-parse", "--short", "HEAD"));
};
function run() {
  const env: NodeJS.ProcessEnv = { ...GIT_ENV, BASE: "main" };
  const result = spawnSync("bash", [SCRIPT], { cwd: repo, env, encoding: "utf8" });
  return { code: result.status, stderr: result.stderr };
}
// 1 is the verdict; 2 is the script failing to run (no merge-base), which proves nothing.
function failsNaming(...needles: string[]) {
  const { code, stderr } = run();
  expect(code, stderr).toBe(1);
  for (const needle of needles) expect(stderr).toContain(needle);
  return stderr;
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "tot-integrity-"));
  commits = [];
  git("init", "-q", "-b", "main");
  write(EXISTING, "it('adds', () => expect(1 + 1).toBe(2));\n");
  write("src/app.ts", "export const x = 1;\n");
  commit("base");
  commits = [];
  git("checkout", "-q", "-b", "feature");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("existing tests are locked", () => {
  it("adding a new test passes", () => {
    write(NEW, "it('new', () => {});\n");
    commit();
    expect(run().code).toBe(0);
  });

  it("adding a test to an existing file passes", () => {
    appendFileSync(join(repo, EXISTING), "it('more', () => expect(2 + 2).toBe(4));\n");
    commit();
    expect(run().code).toBe(0);
  });

  it("changing a test this branch added passes", () => {
    write(NEW, "it('new', () => {});\n");
    commit();
    write(NEW, "it('new', () => expect(1).toBe(1));\n");
    commit();
    expect(run().code).toBe(0);
  });

  it("editing an existing test fails", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    failsNaming(`${commits[0]} ${EXISTING}:`);
  });

  it("deleting an existing test fails", () => {
    unlinkSync(join(repo, EXISTING));
    commit();
    failsNaming(`${commits[0]} ${EXISTING}:`);
  });

  it("renaming an existing test fails", () => {
    renameSync(join(repo, EXISTING), join(repo, `${DIR}/moved.test.ts`));
    commit();
    failsNaming(`${commits[0]} ${EXISTING}:`);
  });

  it('a commit whose message starts "Test change:" may edit an existing test', () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit("Test change: the rounding rule changed");
    expect(run().code).toBe(0);
  });

  it('a "Test change:" commit does not cover the commit after it', () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit("Test change: the rounding rule changed");
    write(EXISTING, "it('adds', () => expect(3).toBe(3));\n");
    commit();
    const stderr = failsNaming(`${commits[1]} ${EXISTING}:`);
    expect(stderr).not.toContain(commits[0]);
  });

  for (const [marker, line] of Object.entries(MARKERS)) {
    it(`turning a test off fails, even in a new test: ${marker}`, () => {
      write(NEW, `${line}\nit('new', () => {});\n`);
      commit();
      failsNaming("skip/only marker", line.slice(0, 20));
    });
  }

  it("an uncommitted edit to an existing test fails", () => {
    write(EXISTING, "it('adds', () => {});\n");
    failsNaming(`uncommitted ${EXISTING}:`);
  });

  it("editing something that is not a test passes", () => {
    write("src/app.ts", "export const x = 2;\n");
    commit();
    expect(run().code).toBe(0);
  });
});

describe("pre-rule commits can be waived, from the base only", () => {
  const WAIVERS = ".test-integrity-waivers";
  const full = (short: string | undefined) => git("rev-parse", String(short));
  const waiveOnMain = (line: string) => {
    git("checkout", "-q", "main");
    write(WAIVERS, `# Pre-rule commits.\n${line}\n`);
    git("add", "-A");
    git("commit", "-q", "-m", "Waive a pre-rule commit");
    git("checkout", "-q", "feature");
  };

  it("a commit waived on the base passes, and the check says so", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    waiveOnMain(`${full(commits[0])} demo fixture; pre-rule (approved: god)`);
    const result = spawnSync("bash", [SCRIPT], { cwd: repo, env: { ...GIT_ENV, BASE: "main" }, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`waived ${commits[0]}: demo fixture; pre-rule (approved: god)`);
  });

  it("a waiver covers only the commit it names", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    waiveOnMain(`${full(commits[0])} demo fixture; pre-rule (approved: god)`);
    write(EXISTING, "it('adds', () => expect(3).toBe(3));\n");
    commit();
    const stderr = failsNaming(`${commits[1]} ${EXISTING}:`);
    expect(stderr).not.toContain(`${commits[0]} ${EXISTING}:`);
  });

  it("a waiver written on the branch itself does not count", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    write(WAIVERS, `${full(commits[0])} my own waiver (approved: god)\n`);
    commit("Waive my own commit");
    failsNaming(`${commits[0]} ${EXISTING}:`);
  });

  it("a malformed waiver fails", () => {
    write(NEW, "it('new', () => {});\n");
    commit();
    waiveOnMain("abc123 fixture (approved: god)");
    failsNaming("Malformed line", "abc123 fixture");
  });
});

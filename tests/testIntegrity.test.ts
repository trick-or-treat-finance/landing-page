// @vitest-environment node
/** features/test-integrity.feature: each scenario runs the script against a real git repository in a temp dir. */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(resolve(dirname(new URL(import.meta.url).pathname), ".."), "scripts", "check-test-integrity.sh");
const EXISTING = "tests/budget.test.ts";
const TITLE = "Add the budget view";

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

const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, env: GIT_ENV, stdio: "pipe" });
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
};
const commit = () => {
  git("add", "-A");
  git("commit", "-q", "-m", "change");
};
function run(title: string | undefined) {
  const env: NodeJS.ProcessEnv = { ...GIT_ENV, BASE: "main" };
  delete env.PR_TITLE;
  if (title !== undefined) env.PR_TITLE = title;
  const result = spawnSync("bash", [SCRIPT], { cwd: repo, env, encoding: "utf8" });
  return { code: result.status, stderr: result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "tot-integrity-"));
  git("init", "-q", "-b", "main");
  write(EXISTING, "it('adds', () => expect(1 + 1).toBe(2));\n");
  write("src/app.ts", "export const x = 1;\n");
  commit();
  git("checkout", "-q", "-b", "feature");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("existing tests are locked", () => {
  it("adding a new test is allowed", () => {
    write("tests/new.test.ts", "it('new', () => {});\n");
    commit();
    expect(run(TITLE).code).toBe(0);
  });

  it("editing an existing test is refused", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    const { code, stderr } = run(TITLE);
    // 1 is the verdict; 2 is the script failing to run, which proves nothing.
    expect(code).toBe(1);
    expect(stderr).toContain(EXISTING);
  });

  it("deleting an existing test is refused", () => {
    unlinkSync(join(repo, EXISTING));
    commit();
    const { code, stderr } = run(TITLE);
    expect(code).toBe(1);
    expect(stderr).toContain(EXISTING);
  });

  it("renaming an existing test is refused", () => {
    renameSync(join(repo, EXISTING), join(repo, "tests/moved.test.ts"));
    commit();
    const { code, stderr } = run(TITLE);
    expect(code).toBe(1);
    expect(stderr).toContain(EXISTING);
  });

  it("a pull request titled as a test change may edit an existing test", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    expect(run("Test change: the rounding rule changed").code).toBe(0);
  });

  it("without a title the check refuses, rather than guessing", () => {
    write(EXISTING, "it('adds', () => {});\n");
    commit();
    expect(run(undefined).code).toBe(1);
  });

  it("editing something that is not a test is allowed", () => {
    write("src/app.ts", "export const x = 2;\n");
    commit();
    expect(run(undefined).code).toBe(0);
  });
});

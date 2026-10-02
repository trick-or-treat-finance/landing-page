import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Static front door for bots: robots.txt, security.txt and the /hello-hacker page.
// Scenarios are written Given / When / Then; no browser needed, only the built files.
const out = mkdtempSync(join(tmpdir(), "tot-bots-"));
const read = (p: string) => readFileSync(join(out, p), "utf8");
const TODAY = new Date("2026-10-02T00:00:00Z");

beforeAll(() => {
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir"], { stdio: "pipe" });
}, 120_000);

// A robots.txt group: the user-agent lines and the rules that follow them.
function groups(txt: string) {
  const res: { agents: string[]; rules: string[] }[] = [];
  let cur: { agents: string[]; rules: string[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...v] = line.split(":");
    const key = k.toLowerCase(), val = v.join(":").trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; res.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true;
    } else { cur?.rules.push(`${key}: ${val}`); lastWasAgent = false; }
  }
  return res;
}
const rulesFor = (txt: string, agent: string) =>
  groups(txt).find((g) => g.agents.includes(agent.toLowerCase()))?.rules ?? null;

describe("Given a crawler that reads robots.txt", () => {
  const AI = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "CCBot", "Google-Extended",
    "PerplexityBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent", "Amazonbot"];
  it("is published as a plain text file", () => {
    expect(existsSync(join(out, "robots.txt"))).toBe(true);
  });
  for (const bot of AI) {
    it(`then ${bot} is told to stay out`, () => {
      expect(rulesFor(read("robots.txt"), bot)).toContain("disallow: /");
    });
  }
  it("then a search engine is still welcome on the landing page", () => {
    const rules = rulesFor(read("robots.txt"), "*");
    expect(rules).not.toBeNull();
    expect(rules).not.toContain("disallow: /");
  });
  it("then it speaks in the ghost's voice and names no stack or route", () => {
    const t = read("robots.txt");
    expect(t).toMatch(/^#.*(robot|ghost)/im);
    expect(t).not.toMatch(/fastapi|plaid|cloud run|nginx|vite|github|\/api|\/admin|\/plaid/i);
  });
});

describe("Given a visitor opens /.well-known/security.txt", () => {
  const sec = () => read(".well-known/security.txt");
  const field = (n: string) => sec().match(new RegExp(`^${n}:\\s*(.+)$`, "im"))?.[1].trim();
  it("then Contact is the placeholder the owner fills in", () => {
    expect(field("Contact")).toBe("mailto:polegarh@gmail.com");
  });
  it("then Expires is in the future and under a year from 2026-10-02", () => {
    const exp = new Date(field("Expires") ?? "");
    expect(Number.isNaN(exp.getTime())).toBe(false);
    expect(exp.getTime()).toBeGreaterThan(Date.now());
    expect(exp.getTime()).toBeLessThan(TODAY.getTime() + 365 * 864e5);
  });
  it("then it names no stack, version or path", () => {
    expect(sec()).not.toMatch(/fastapi|plaid|cloud run|nginx|\/Users\/|v\d+\.\d+/i);
  });
});

describe("Given GitHub Pages serves the build", () => {
  it("then Jekyll is off, so the dot-folder .well-known is served", () => {
    expect(existsSync(join(out, ".nojekyll"))).toBe(true);
  });
});

describe("Given a visitor opens /hello-hacker", () => {
  const html = () => read("hello-hacker.html");
  it("then the page exists and is kept out of search", () => {
    expect(html()).toMatch(/<meta name="robots" content="noindex/);
  });
  it("then it asks them to tell us instead", () => {
    expect(html()).toMatch(/<h1[^>]*>[^<]*(hack|poking)/i);
    expect(html()).toMatch(/mailto:polegarh@gmail.com/);
  });
  it("then it names no technology and no route", () => {
    const text = html().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "");
    expect(text).not.toMatch(/fastapi|plaid|cloud run|nginx|vite|react|github|firebase|\/api\b|\/admin|\/plaid/i);
  });
  it("then it links home and loads only local assets", () => {
    expect(html()).toMatch(/class="brand"/);
    expect(html()).not.toMatch(/(src|href)="https?:\/\/(?!trick)/);
  });
});

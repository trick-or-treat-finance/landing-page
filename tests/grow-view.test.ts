import { describe, expect, it } from "vitest";
import { GROW_DEFAULT, grow } from "../src/engine";
import { axisMoney, GROW_DISCLAIMER, growChart, growLine, growOutput, growSection } from "../src/grow-view";

describe("grow view", () => {
  const html = growSection();
  it("shows the default example: $100 a month, 10 years, 7%", () => {
    expect(html).toContain("$17,409.45");
    expect(html).toContain("$12,000.00");
    expect(html).toContain('id="g-years"');
    expect(html).toContain("example rate, you pick it");
  });
  it("carries the required disclaimer and keeps the investing half unbuilt", () => {
    expect(html).toContain(GROW_DISCLAIMER);
    expect(GROW_DISCLAIMER).toBe(
      "Illustration only. Example rate, not a prediction or a return for any company shown. Investing can lose money. Not investment advice.",
    );
    expect(html).toContain("The investing half is not built yet.");
  });
  it("never says will, names a company, or quotes a ticker", () => {
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\bwill\b|\bguarantee/i);
    expect(text).not.toMatch(/\b(Apple|DoorDash|Nvidia|Costco|Amazon|Google|Microsoft|Walmart|Netflix|Spotify|Starbucks|Uber)\b|\b[A-Z]{3,5}:/);
  });
  it("labels every control and starts them disabled until JS wakes them", () => {
    expect(html).toMatch(/<label for="g-years"/);
    expect(html).toMatch(/<label for="g-rate"/);
    expect(html).toMatch(/<legend>The treat<\/legend>/);
    expect((html.match(/ disabled \/>/g) ?? []).length).toBe(4);
  });
  it("the chart is one image with a text alternative that carries the end numbers", () => {
    const svg = growChart(GROW_DEFAULT, grow(GROW_DEFAULT));
    expect(svg).toMatch(/role="img" aria-label="\$100 a month, 10 years, example rate 7%: \$12,000.00 put in, \$17,409.45 total value\."/);
  });
  it("gen z line reads for monthly, once and 0%", () => {
    const m = grow(GROW_DEFAULT);
    expect(growLine(GROW_DEFAULT, m)).toBe(
      "$100 a month for 10 years is $12,000.00 from you. at your example 7% it became $17,409.45. the extra $5,409.45 is just time.",
    );
    const once = { ...GROW_DEFAULT, mode: "once" as const };
    expect(growLine(once, grow(once))).toBe("$100 once, left alone for 10 years, became $200.97 at your example 7%. no extra deposits. just time.");
    const zero = { ...GROW_DEFAULT, rateBp: 0 };
    expect(growLine(zero, grow(zero))).toContain("at 0% nothing grows");
  });
  it("singular year", () => {
    const one = { ...GROW_DEFAULT, years: 1 };
    expect(growLine(one, grow(one))).toContain("for 1 year is");
  });
  it("redraws for every legal input without NaN", () => {
    for (const years of [1, 2, 11, 30]) for (const rateBp of [0, 50, 1200]) for (const mode of ["monthly", "once"] as const) {
      const out = growOutput({ mode, depositCents: 10_000, years, rateBp });
      expect(out).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
  it("axis money is short", () => {
    expect(axisMoney(0)).toBe("$0");
    expect(axisMoney(25_000)).toBe("$250");
    expect(axisMoney(250_000)).toBe("$2.5k");
    expect(axisMoney(5_000_000)).toBe("$50k");
    expect(axisMoney(150_000_000)).toBe("$1.5M");
  });
});

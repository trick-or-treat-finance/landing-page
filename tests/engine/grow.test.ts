import { describe, expect, it } from "vitest";
import { clampGrow, GROW_DEFAULT, grow, growMonth, niceMax, type GrowInput } from "../../src/engine";

const run = (over: Partial<GrowInput>) => grow({ ...GROW_DEFAULT, ...over });

// Reference values come from an independent Decimal calculation (Python, half-up cents each month).
describe("grow", () => {
  it("$100 a month, 10 years, 7%: $12,000.00 in, $17,409.45 after", () => {
    const r = run({});
    expect(r.putInCents).toBe(1_200_000);
    expect(r.valueCents).toBe(1_740_945);
    expect(r.addedCents).toBe(540_945);
    expect(r.points).toHaveLength(121);
  });
  it("$100 once, 10 years, 7%: $200.97", () => {
    const r = run({ mode: "once" });
    expect(r.putInCents).toBe(10_000);
    expect(r.valueCents).toBe(20_097);
  });
  it("$100 a month, 30 years, 12%: $36,000.00 in, $352,991.31 after", () => {
    const r = run({ years: 30, rateBp: 1200 });
    expect(r.putInCents).toBe(3_600_000);
    expect(r.valueCents).toBe(35_299_131);
  });
  it("$100 once, 30 years, 12%: $3,594.69", () => {
    expect(run({ mode: "once", years: 30, rateBp: 1200 }).valueCents).toBe(359_469);
  });
  it("1 year at 7%: $1,246.48 from $1,200.00", () => {
    expect(run({ years: 1 }).valueCents).toBe(124_648);
  });
  it("0% adds nothing", () => {
    const r = run({ rateBp: 0 });
    expect(r.valueCents).toBe(r.putInCents);
    expect(r.addedCents).toBe(0);
  });
  it("first point is zero and the last is the result", () => {
    const r = run({});
    expect(r.points[0]).toEqual({ month: 0, putInCents: 0, valueCents: 0 });
    expect(r.points.at(-1)).toEqual({ month: 120, putInCents: r.putInCents, valueCents: r.valueCents });
  });
  it("value never falls below what was put in, and only rises", () => {
    for (const rateBp of [0, 50, 700, 1200]) {
      const r = run({ rateBp });
      r.points.forEach((p, k) => {
        expect(p.valueCents).toBeGreaterThanOrEqual(p.putInCents);
        if (k) expect(p.valueCents).toBeGreaterThanOrEqual(r.points[k - 1]!.valueCents);
      });
    }
  });
  it("a higher rate never gives less", () => {
    expect(run({ rateBp: 800 }).valueCents).toBeGreaterThan(run({ rateBp: 700 }).valueCents);
  });
  it("all amounts are whole cents", () => {
    for (const p of run({ rateBp: 650, years: 7 }).points) {
      expect(Number.isInteger(p.valueCents)).toBe(true);
      expect(Number.isInteger(p.putInCents)).toBe(true);
    }
  });
  it("rounds half up to the cent", () => {
    // 10_050 cents grown by 0.5%/12: 10_054.1875 -> 10_054
    expect(growMonth(0, 10_050, 50)).toBe(10_054);
    // 1200 bp = 1% a month: 50 -> 50.5 -> 51 (half up), 3 -> 3.03 -> 3
    expect(growMonth(0, 50, 1200)).toBe(51);
    expect(growMonth(0, 3, 1200)).toBe(3);
  });
});

describe("clampGrow", () => {
  it("pulls odd inputs into range", () => {
    expect(clampGrow({ mode: "monthly", depositCents: -5, years: 99, rateBp: 5000 })).toEqual({
      mode: "monthly", depositCents: 0, years: 30, rateBp: 1200,
    });
    expect(clampGrow({ mode: "once", depositCents: 10_000, years: 0, rateBp: -1 }).years).toBe(1);
    expect(clampGrow({ ...GROW_DEFAULT, years: Number.NaN }).years).toBe(1);
  });
});

describe("niceMax", () => {
  it("rounds up to a tidy axis maximum", () => {
    expect(niceMax(1_740_945)).toBe(2_000_000);
    expect(niceMax(35_299_131)).toBe(50_000_000);
    expect(niceMax(20_097)).toBe(25_000);
    expect(niceMax(0)).toBe(10_000);
  });
});

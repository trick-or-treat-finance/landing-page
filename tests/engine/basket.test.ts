import { describe, expect, it } from "vitest";
import { SAMPLE_MONTH, treatBasket, type ReceiptLine } from "../../src/engine";

const L = (id: string, amountCents: number, ticker?: string): ReceiptLine =>
  ticker ? { id, merchant: id, category: id, amountCents, ticker } : { id, merchant: id, category: id, amountCents };

// Deterministic PRNG (mulberry32) so property runs are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const TICKERS = ["AAPL", "DASH", "GOOGL", "WMT", "AMZN", "MSFT", "NVDA", "SBUX", "NFLX", "COST", "UBER", "SPOT"];

describe("treatBasket", () => {
  it("splits the sample month to exactly $100.00, in first-seen order", () => {
    const b = treatBasket(SAMPLE_MONTH);
    expect(b.reduce((s, p) => s + p.treatCents, 0)).toBe(10000);
    expect(b.map((p) => p.ticker)).toEqual(SAMPLE_MONTH.filter((l) => l.ticker).map((l) => l.ticker));
    expect(b[0]).toEqual({ ticker: "WMT", name: "Walmart", spendCents: 14236, treatCents: 572 });
  });
  it("is stable: same input, same output", () => {
    expect(treatBasket(SAMPLE_MONTH)).toEqual(treatBasket(SAMPLE_MONTH));
  });
  it("gives leftover cents to the largest remainders, ties to the earlier company", () => {
    const b = treatBasket([L("a", 1, "AAPL"), L("b", 1, "DASH"), L("c", 1, "WMT")], 1);
    expect(b.map((p) => p.treatCents)).toEqual([34, 33, 33]);
    const c = treatBasket([L("a", 2, "AAPL"), L("b", 1, "DASH")], 0.1);
    expect(c.map((p) => p.treatCents)).toEqual([7, 3]); // 6.67 -> 7, 3.33 -> 3
  });
  it("merges lines of one company", () => {
    const b = treatBasket([L("a", 100, "AAPL"), L("x", 50), L("b", 100, "AAPL")]);
    expect(b).toEqual([{ ticker: "AAPL", name: "Apple", spendCents: 200, treatCents: 10000 }]);
  });
  it("ignores unowned lines and zero-amount lines", () => {
    const b = treatBasket([L("rent", 210000), L("z", 0, "AAPL"), L("w", 5, "WMT")]);
    expect(b.map((p) => p.ticker)).toEqual(["WMT"]);
  });
  it("returns an empty basket when nothing is ownable", () => {
    expect(treatBasket([])).toEqual([]);
    expect(treatBasket([L("rent", 100)])).toEqual([]);
    expect(treatBasket([L("z", 0, "AAPL")])).toEqual([]);
  });
  it("handles a zero budget", () => {
    expect(treatBasket([L("a", 5, "AAPL")], 0).map((p) => p.treatCents)).toEqual([0]);
  });
  it("takes a non-default budget", () => {
    const b = treatBasket(SAMPLE_MONTH, 250.5);
    expect(b.reduce((s, p) => s + p.treatCents, 0)).toBe(25050);
  });
  it("rejects bad budgets and amounts", () => {
    expect(() => treatBasket(SAMPLE_MONTH, 0.005)).toThrow(RangeError);
    expect(() => treatBasket(SAMPLE_MONTH, -1)).toThrow(RangeError);
    expect(() => treatBasket(SAMPLE_MONTH, NaN)).toThrow(RangeError);
    expect(() => treatBasket([L("a", 1.5, "AAPL")])).toThrow(RangeError);
    expect(() => treatBasket([L("a", -1, "AAPL")])).toThrow(RangeError);
  });
  it("rejects a ticker it does not know", () => {
    expect(() => treatBasket([L("a", 5, "XXXX")])).toThrow(RangeError);
  });

  describe("properties (500 seeded random months)", () => {
    const rand = rng(20260929);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    for (let n = 0; n < 500; n++) {
      const count = int(1, 12);
      const lines = Array.from({ length: count }, (_, i) =>
        L(`l${i}`, int(0, 1) ? int(1, 900000) : int(1, 50), TICKERS[int(0, TICKERS.length - 1)]),
      );
      const budgetCents = int(0, 100000);
      it(`case ${n}: parts sum to the budget, within one cent of ideal, order stable`, () => {
        const b = treatBasket(lines, budgetCents / 100);
        const total = lines.reduce((s, l) => s + l.amountCents, 0);
        expect(b.reduce((s, p) => s + p.treatCents, 0)).toBe(budgetCents);
        for (const p of b) {
          const ideal = (budgetCents * p.spendCents) / total;
          expect(p.treatCents).toBeGreaterThanOrEqual(Math.floor(ideal));
          expect(p.treatCents).toBeLessThanOrEqual(Math.ceil(ideal));
        }
        const seen = [...new Set(lines.map((l) => l.ticker))];
        expect(b.map((p) => p.ticker)).toEqual(seen);
      });
    }
  });
});

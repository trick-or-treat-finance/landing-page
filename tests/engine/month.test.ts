import { describe, expect, it } from "vitest";
import { buildYourMonth, PURCHASE_KINDS, COMPANIES } from "../../src/engine";

describe("buildYourMonth", () => {
  it("totals trick, ownable and basket", () => {
    const m = buildYourMonth([
      { kind: "groceries", amountCents: 60000 },
      { kind: "coffee", amountCents: 20000 },
      { kind: "rent", amountCents: 210000 },
    ]);
    expect(m.trickCents).toBe(290000);
    expect(m.ownableCents).toBe(80000);
    expect(m.basket.map((p) => [p.ticker, p.treatCents])).toEqual([["WMT", 7500], ["SBUX", 2500]]);
  });
  it("gives an empty basket when only nothing-to-own kinds are chosen", () => {
    const m = buildYourMonth([{ kind: "rent", amountCents: 1000 }, { kind: "local", amountCents: 500 }]);
    expect(m).toEqual({ trickCents: 1500, ownableCents: 0, basket: [] });
  });
  it("handles no choices", () => {
    expect(buildYourMonth([])).toEqual({ trickCents: 0, ownableCents: 0, basket: [] });
  });
  it("adds repeated kinds together and honours a custom budget", () => {
    const m = buildYourMonth([{ kind: "music", amountCents: 100 }, { kind: "music", amountCents: 300 }], 20);
    expect(m.basket).toEqual([{ ticker: "SPOT", name: "Spotify", spendCents: 400, treatCents: 2000 }]);
  });
  it("rejects unknown kinds and bad amounts", () => {
    expect(() => buildYourMonth([{ kind: "yacht", amountCents: 1 }])).toThrow(RangeError);
    expect(() => buildYourMonth([{ kind: "rent", amountCents: -5 }])).toThrow(RangeError);
    expect(() => buildYourMonth([{ kind: "rent", amountCents: 1.5 }])).toThrow(RangeError);
  });
  it("catalogue covers every company once, and the three owns-nothing kinds", () => {
    const owned = PURCHASE_KINDS.filter((k) => k.ticker).map((k) => k.ticker).sort();
    expect(owned).toEqual(COMPANIES.map((c) => c.ticker).sort());
    expect(PURCHASE_KINDS.filter((k) => !k.ticker).map((k) => k.kind)).toEqual(["rent", "utilities", "local"]);
  });
});

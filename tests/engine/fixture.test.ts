import { describe, expect, it } from "vitest";
import { COMPANIES, companyByTicker, ownableCents, SAMPLE_MONTH, SAMPLE_OWNABLE_CENTS, SAMPLE_TOTAL_CENTS } from "../../src/engine";

describe("sample month", () => {
  it("sums exactly to $4,449.88", () => {
    expect(SAMPLE_MONTH.reduce((s, l) => s + l.amountCents, 0)).toBe(444988);
    expect(SAMPLE_TOTAL_CENTS).toBe(444988);
  });
  it("maps exactly $2,488.88 to listed companies", () => {
    expect(ownableCents(SAMPLE_MONTH)).toBe(248888);
    expect(SAMPLE_OWNABLE_CENTS).toBe(248888);
  });
  it("uses each of the twelve companies once and nothing else", () => {
    const tickers = SAMPLE_MONTH.filter((l) => l.ticker).map((l) => l.ticker);
    expect([...tickers].sort()).toEqual(COMPANIES.map((c) => c.ticker).sort());
  });
  it("leaves rent, utilities and local shops as nothing to own", () => {
    const none = SAMPLE_MONTH.filter((l) => !l.ticker).map((l) => l.id);
    expect(none).toEqual(["rent", "corner", "utilities"]);
  });
  it("prints the iPhone 18 Pro Max 1TB at Apple's $1,899 list price", () => {
    const apple = SAMPLE_MONTH.find((l) => l.id === "apple");
    expect(apple).toMatchObject({ ticker: "AAPL", category: "iPhone 18 Pro Max, 1TB", amountCents: 189900 });
  });
  it("prices the subscriptions at their listed monthly plans", () => {
    const cents = (id: string) => SAMPLE_MONTH.find((l) => l.id === id)?.amountCents;
    expect([cents("netflix"), cents("spotify"), cents("microsoft"), cents("google"), cents("nvidia")]).toEqual([1999, 1299, 2299, 1599, 1999]);
  });
  it("has unique line ids and integer cents", () => {
    expect(new Set(SAMPLE_MONTH.map((l) => l.id)).size).toBe(SAMPLE_MONTH.length);
    for (const l of SAMPLE_MONTH) expect(Number.isInteger(l.amountCents)).toBe(true);
  });
});

describe("companies", () => {
  it("looks up by ticker", () => expect(companyByTicker("AAPL").name).toBe("Apple"));
  it("throws on an unknown ticker", () => expect(() => companyByTicker("XXXX")).toThrow(RangeError));
});

import { describe, expect, it } from "vitest";
import { COMPANIES, companyByTicker, ownableCents, SAMPLE_MONTH, SAMPLE_OWNABLE_CENTS, SAMPLE_TOTAL_CENTS } from "../../src/engine";

describe("sample month", () => {
  it("sums exactly to $4,812.63", () => {
    expect(SAMPLE_MONTH.reduce((s, l) => s + l.amountCents, 0)).toBe(481263);
    expect(SAMPLE_TOTAL_CENTS).toBe(481263);
  });
  it("maps exactly $1,835.47 to listed companies", () => {
    expect(ownableCents(SAMPLE_MONTH)).toBe(183547);
    expect(SAMPLE_OWNABLE_CENTS).toBe(183547);
  });
  it("uses each of the twelve companies once and nothing else", () => {
    const tickers = SAMPLE_MONTH.filter((l) => l.ticker).map((l) => l.ticker);
    expect([...tickers].sort()).toEqual(COMPANIES.map((c) => c.ticker).sort());
  });
  it("leaves rent, utilities and local shops as nothing to own", () => {
    const none = SAMPLE_MONTH.filter((l) => !l.ticker).map((l) => l.id);
    expect(none).toEqual(["rent", "corner", "utilities"]);
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

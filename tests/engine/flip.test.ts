import { describe, expect, it } from "vitest";
import { FLIP, planFlip, SAMPLE_MONTH, treatBasket, type ReceiptLine } from "../../src/engine";

const basket = treatBasket(SAMPLE_MONTH);

describe("planFlip", () => {
  const plan = planFlip(SAMPLE_MONTH, basket, 10000);
  it("sends each ownable line to its tile and leaves the rest", () => {
    SAMPLE_MONTH.forEach((l, i) => {
      const expected = l.ticker ? basket.findIndex((b) => b.ticker === l.ticker) : "stays";
      expect(plan.lines[i]).toMatchObject({ lineId: l.id, target: expected });
    });
    expect(plan.lines.filter((l) => l.target === "stays").map((l) => l.lineId)).toEqual(["rent", "corner", "utilities"]);
  });
  it("fans out over 300 ms after the 260 ms knob slide, each travelling 480 ms", () => {
    const flying = plan.lines.filter((l) => l.target !== "stays");
    expect(flying[0].startMs).toBe(260);
    expect(flying[flying.length - 1].startMs).toBe(560);
    for (const f of flying) expect(f.travelMs).toBe(480);
    const starts = flying.map((f) => f.startMs);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
  it("keeps staying lines still", () => {
    for (const l of plan.lines.filter((x) => x.target === "stays")) expect(l).toMatchObject({ startMs: 0, travelMs: 0 });
  });
  it("presses the stamp after the last landing and counts 600 ms", () => {
    expect(plan.stamp).toEqual({ startMs: 560 + 480, durationMs: 180, scaleFrom: 1.3 });
    expect(plan.count).toEqual({ fromCents: 481263, toCents: 10000, startMs: 260, durationMs: 600 });
    expect(plan.totalMs).toBe(1040 + 180);
    expect(plan.crossFadeMs).toBe(0);
  });
  it("reduced motion: instant swap, 120 ms cross-fade, nothing travels", () => {
    const r = planFlip(SAMPLE_MONTH, basket, 10000, true);
    expect(r.lines.map((l) => l.target)).toEqual(plan.lines.map((l) => l.target));
    for (const l of r.lines) expect(l).toMatchObject({ startMs: 0, travelMs: 0 });
    expect(r.crossFadeMs).toBe(120);
    expect(r.stamp.startMs).toBe(0);
    expect(r.count).toMatchObject({ startMs: 0, durationMs: 0 });
    expect(r.totalMs).toBe(FLIP.crossFadeMs);
  });
  it("a single flying line starts right after the knob", () => {
    const lines: ReceiptLine[] = [
      { id: "a", merchant: "a", category: "a", amountCents: 100, ticker: "AAPL" },
      { id: "r", merchant: "r", category: "r", amountCents: 900 },
    ];
    const p = planFlip(lines, treatBasket(lines), 10000);
    expect(p.lines).toEqual([
      { lineId: "a", target: 0, startMs: 260, travelMs: 480 },
      { lineId: "r", target: "stays", startMs: 0, travelMs: 0 },
    ]);
    expect(p.stamp.startMs).toBe(740);
  });
  it("with nothing to fly, the stamp follows the knob and the count still runs", () => {
    const lines: ReceiptLine[] = [{ id: "r", merchant: "r", category: "r", amountCents: 900 }];
    const p = planFlip(lines, [], 0);
    expect(p.lines[0].target).toBe("stays");
    expect(p.stamp.startMs).toBe(260);
    expect(p.totalMs).toBe(860);
  });
  it("keeps a ticker line on the paper when its company is not in the basket", () => {
    const lines: ReceiptLine[] = [{ id: "z", merchant: "z", category: "z", amountCents: 0, ticker: "AAPL" }];
    expect(planFlip(lines, [], 0).lines[0].target).toBe("stays");
  });
});

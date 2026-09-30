import { companyByTicker } from "./companies";
import type { BasketPart, ReceiptLine } from "./types";

export function assertCents(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a non-negative integer number of cents, got ${value}`);
  }
}

/** Sum of the lines that map to a listed company. */
export function ownableCents(lines: readonly ReceiptLine[]): number {
  return lines.reduce((sum, l) => (l.ticker ? sum + l.amountCents : sum), 0);
}

/**
 * Split a treat budget across the companies in `lines`, in proportion to
 * spend. Largest-remainder: every part is floor(ideal) or floor(ideal)+1
 * cents and the parts sum exactly to the budget. Ties go to the company that
 * appears first, so the result is stable. Companies come out in first-seen
 * order. No ownable spend means an empty basket.
 *
 * @param budget dollars, at most two decimals (default 100)
 */
export function treatBasket(lines: readonly ReceiptLine[], budget = 100): BasketPart[] {
  const budgetCents = Math.round(budget * 100);
  if (Math.abs(budget * 100 - budgetCents) > 1e-6) {
    throw new RangeError(`budget must be whole cents, got ${budget}`);
  }
  assertCents(budgetCents, "budget");

  const spend = new Map<string, number>();
  for (const l of lines) {
    assertCents(l.amountCents, `amount of ${l.id}`);
    if (l.ticker && l.amountCents > 0) spend.set(l.ticker, (spend.get(l.ticker) ?? 0) + l.amountCents);
  }
  const total = [...spend.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const rows = [...spend].map(([ticker, spendCents], order) => {
    const scaled = budgetCents * spendCents;
    return { ticker, spendCents, order, floor: Math.floor(scaled / total), rem: scaled % total };
  });
  let leftover = budgetCents - rows.reduce((s, r) => s + r.floor, 0);
  const byRemainder = [...rows].sort((a, b) => b.rem - a.rem || a.order - b.order);
  for (const r of byRemainder) {
    if (leftover === 0) break;
    r.floor += 1;
    leftover -= 1;
  }
  return rows.map((r) => ({
    ticker: r.ticker,
    name: companyByTicker(r.ticker).name,
    spendCents: r.spendCents,
    treatCents: r.floor,
  }));
}

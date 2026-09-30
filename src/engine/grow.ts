// "Watch the treat grow": compound growth of a deposit at an example rate the visitor picks.
// Integer cents throughout. Deposits land at the start of the month, then that month's interest
// (rate / 12) is added and rounded half up to the cent. This is arithmetic on a chosen rate, not a
// forecast and not a return for any company.

export type GrowMode = "monthly" | "once";

export interface GrowInput {
  mode: GrowMode;
  /** The treat, in cents (10_000 = $100.00). */
  depositCents: number;
  years: number;
  /** Example yearly rate in basis points (700 = 7.00%). */
  rateBp: number;
}

export interface GrowPoint {
  month: number;
  putInCents: number;
  valueCents: number;
}

export interface GrowResult {
  points: readonly GrowPoint[];
  putInCents: number;
  valueCents: number;
  /** valueCents - putInCents: what the example rate added. */
  addedCents: number;
}

export const GROW_LIMITS = { minYears: 1, maxYears: 30, minRateBp: 0, maxRateBp: 1200, stepRateBp: 50 } as const;
export const GROW_DEFAULT: GrowInput = { mode: "monthly", depositCents: 10_000, years: 10, rateBp: 700 };

const clampInt = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo;

/** Bring any input inside the sliders' range, so odd values cannot break the math. */
export function clampGrow(i: GrowInput): GrowInput {
  return {
    mode: i.mode === "once" ? "once" : "monthly",
    depositCents: clampInt(i.depositCents, 0, 100_000_000),
    years: clampInt(i.years, GROW_LIMITS.minYears, GROW_LIMITS.maxYears),
    rateBp: clampInt(i.rateBp, GROW_LIMITS.minRateBp, GROW_LIMITS.maxRateBp),
  };
}

/** One month: (balance + deposit) grown by rateBp / 12 of a percent, half up to the cent. */
export function growMonth(balanceCents: number, depositCents: number, rateBp: number): number {
  const base = balanceCents + depositCents;
  return Math.floor((2 * base * (120_000 + rateBp) + 120_000) / 240_000);
}

export function grow(raw: GrowInput): GrowResult {
  const i = clampGrow(raw);
  const months = i.years * 12;
  const points: GrowPoint[] = [{ month: 0, putInCents: 0, valueCents: 0 }];
  let value = 0;
  let putIn = 0;
  for (let m = 1; m <= months; m++) {
    const dep = i.mode === "monthly" || m === 1 ? i.depositCents : 0;
    value = growMonth(value, dep, i.rateBp);
    putIn += dep;
    points.push({ month: m, putInCents: putIn, valueCents: value });
  }
  return { points, putInCents: putIn, valueCents: value, addedCents: value - putIn };
}

/** Round an axis maximum up to a tidy step (1, 2, 2.5, 5 x 10^n), so ticks read as round dollars. */
export function niceMax(cents: number): number {
  if (cents <= 0) return 10_000;
  const mag = 10 ** Math.floor(Math.log10(cents));
  for (const f of [1, 2, 2.5, 5, 10]) if (cents <= f * mag) return f * mag;
  return 10 * mag;
}

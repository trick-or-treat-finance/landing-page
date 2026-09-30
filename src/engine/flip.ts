import type { BasketPart, ReceiptLine } from "./types";

/** Motion spec, direction.html section 08 "Trick/Treat flip". */
export const FLIP = {
  knobMs: 260,
  /** Window over which ownable lines fan out, first to last. */
  fanOutMs: 300,
  travelMs: 480,
  overshootPx: 4,
  stampMs: 180,
  stampScaleFrom: 1.3,
  countMs: 600,
  crossFadeMs: 120,
} as const;

export interface LineFlip {
  lineId: string;
  /** Tile index in the basket, or 'stays' on the paper. */
  target: number | "stays";
  /** ms after the flip starts that this line lifts; 0 for lines that stay. */
  startMs: number;
  /** ms the line takes to reach its tile; 0 for lines that stay. */
  travelMs: number;
}

export interface FlipPlan {
  lines: LineFlip[];
  /** Stamp presses in once the last line has landed (or the knob, if none flew). */
  stamp: { startMs: number; durationMs: number; scaleFrom: number };
  count: { fromCents: number; toCents: number; startMs: number; durationMs: number };
  /** Reduced motion: instant swap with a cross-fade, no travel. */
  crossFadeMs: number;
  totalMs: number;
}

/**
 * Plan the Trick->Treat flip. Ownable lines whose company is in `basket` get
 * that tile's index; everything else stays. Fan-out is spread evenly over
 * FLIP.fanOutMs in receipt order. With reducedMotion nothing travels.
 */
export function planFlip(
  lines: readonly ReceiptLine[],
  basket: readonly BasketPart[],
  treatBudgetCents: number,
  reducedMotion = false,
): FlipPlan {
  const tileOf = new Map(basket.map((b, i) => [b.ticker, i]));
  const flying = lines.filter((l) => l.ticker !== undefined && tileOf.has(l.ticker));
  const trickCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const motion = !reducedMotion;
  const gap = flying.length > 1 ? FLIP.fanOutMs / (flying.length - 1) : 0;

  let lastLand: number = FLIP.knobMs;
  const plan = lines.map((l): LineFlip => {
    const rank = flying.indexOf(l);
    if (rank < 0) return { lineId: l.id, target: "stays", startMs: 0, travelMs: 0 };
    const startMs = motion ? Math.round(FLIP.knobMs + rank * gap) : 0;
    const travelMs = motion ? FLIP.travelMs : 0;
    lastLand = Math.max(lastLand, startMs + travelMs);
    return { lineId: l.id, target: tileOf.get(l.ticker as string) as number, startMs, travelMs };
  });

  const stampStart = motion ? lastLand : 0;
  return {
    lines: plan,
    stamp: { startMs: stampStart, durationMs: FLIP.stampMs, scaleFrom: FLIP.stampScaleFrom },
    count: {
      fromCents: trickCents,
      toCents: treatBudgetCents,
      startMs: motion ? FLIP.knobMs : 0,
      durationMs: motion ? FLIP.countMs : 0,
    },
    crossFadeMs: motion ? 0 : FLIP.crossFadeMs,
    totalMs: motion ? Math.max(stampStart + FLIP.stampMs, FLIP.knobMs + FLIP.countMs) : FLIP.crossFadeMs,
  };
}

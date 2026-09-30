import { treatBasket, assertCents, ownableCents } from "./basket";
import type { BasketPart, ReceiptLine } from "./types";

export interface PurchaseKind {
  kind: string;
  label: string;
  /** Absent for spending you cannot own a piece of ("nothing to own"). */
  ticker?: string;
}

/** What the sandbox chips offer. Rent, utilities and local shops own nothing. */
export const PURCHASE_KINDS: readonly PurchaseKind[] = [
  { kind: "groceries", label: "Groceries", ticker: "COST" },
  { kind: "coffee", label: "Coffee & takeaway", ticker: "SBUX" },
  { kind: "online", label: "Online shopping", ticker: "AMZN" },
  { kind: "phone", label: "Phone & devices", ticker: "AAPL" },
  { kind: "rideshare", label: "Rideshare", ticker: "UBER" },
  { kind: "video", label: "Video streaming", ticker: "NFLX" },
  { kind: "music", label: "Music streaming", ticker: "SPOT" },
  { kind: "software", label: "Software", ticker: "MSFT" },
  { kind: "cloud", label: "Cloud & apps", ticker: "GOOGL" },
  { kind: "charging", label: "EV charging", ticker: "TSLA" },
  { kind: "hardware", label: "Computer hardware", ticker: "NVDA" },
  { kind: "rent", label: "Rent" },
  { kind: "utilities", label: "Utilities & insurance" },
  { kind: "local", label: "Local shops & restaurants" },
];

export interface Choice {
  kind: string;
  amountCents: number;
}

export interface YourMonth {
  trickCents: number;
  ownableCents: number;
  basket: BasketPart[];
}

export function buildYourMonth(choices: readonly Choice[], budget = 100): YourMonth {
  const lines: ReceiptLine[] = choices.map((c, i) => {
    const k = PURCHASE_KINDS.find((p) => p.kind === c.kind);
    if (!k) throw new RangeError(`unknown purchase kind: ${c.kind}`);
    assertCents(c.amountCents, `amount of ${c.kind}`);
    const base = { id: `${c.kind}-${i}`, merchant: k.label, category: k.label, amountCents: c.amountCents };
    return k.ticker ? { ...base, ticker: k.ticker } : base;
  });
  return {
    trickCents: lines.reduce((s, l) => s + l.amountCents, 0),
    ownableCents: ownableCents(lines),
    basket: treatBasket(lines, budget),
  };
}

// String builders shared by the build (static receipt, tiles, sandbox defaults) and the browser.
// The page is complete HTML before any script runs; the script only takes it over.
import {
  COMPANIES,
  SAMPLE_MONTH,
  SAMPLE_OWNABLE_CENTS,
  SAMPLE_TOTAL_CENTS,
  buildYourMonth,
  treatBasket,
  type BasketPart,
  type ReceiptLine,
} from "./engine";

export const TREAT_BUDGET = 100;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (cents: number): string => usd.format(cents / 100);
/** Receipt columns print amounts without the currency sign. */
export const plain = (cents: number): string => usd.format(cents / 100).slice(1);

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Official marks, bundled in public/logos. Costco has none in simple-icons: it gets a text badge. */
const LOGO: Record<string, string> = {
  AAPL: "apple", TSLA: "tesla", GOOGL: "google", WMT: "walmart", AMZN: "amazon", MSFT: "microsoft",
  NVDA: "nvidia", SBUX: "starbucks", NFLX: "netflix", UBER: "uber", SPOT: "spotify",
};

export function logo(ticker: string, base: string): string {
  const name = COMPANIES.find((c) => c.ticker === ticker)?.name ?? ticker;
  const slug = LOGO[ticker];
  if (!slug) return `<span class="logo logo-text" aria-hidden="true">${esc(name.toUpperCase())}</span>`;
  return `<span class="logo"><img src="${base}logos/${slug}.svg" width="20" height="20" alt="${esc(name)} logo" /></span>`;
}

const STAY_LABEL: Record<string, string> = {
  rent: "Rent",
  corner: "Corner restaurant",
  utilities: "Utilities & insurance",
};
const STAY_TREAT: Record<string, string> = {
  rent: "Rent · nothing to own",
  corner: "Corner restaurant · nothing to own",
  utilities: "Utilities & insurance · nothing to own",
};
export const stayTreat = (id: string): string | undefined => STAY_TREAT[id];

const label = (l: ReceiptLine): string => STAY_LABEL[l.id] ?? l.merchant;

export function receiptLines(): string {
  return SAMPLE_MONTH.map((l, n) => {
    const own = l.ticker ? ` data-ticker="${l.ticker}"` : "";
    return (
      `<li class="slot${l.ticker ? "" : " stay"}" data-id="${l.id}"${own} style="--n:${n}">` +
      `<div class="ln"><span class="nm">${esc(label(l))}</span><i></i><b>${plain(l.amountCents)}</b></div></li>`
    );
  }).join("");
}

export function tiles(base: string): string {
  const basket = treatBasket(SAMPLE_MONTH, TREAT_BUDGET);
  return basket
    .map((b, i) => {
      const t = tileLabel(b);
      return (
        `<li class="tile" data-ticker="${b.ticker}" style="--i:${i}" aria-label="${esc(t)}">` +
        `${logo(b.ticker, base)}<span class="tn">${esc(b.name)}<small>${b.ticker}</small></span><em>${money(b.treatCents)}</em></li>`
      );
    })
    .join("");
}

export const tileLabel = (b: BasketPart): string =>
  `${b.name}, ${b.ticker}, ${money(b.treatCents)} of the sample $100.00 treat`;

export interface SandboxKind {
  id: string;
  chip: string;
  kind: string;
  min: number;
  max: number;
  dflt: number;
  on: boolean;
}

/** Copy ids sandbox.chip.* and sandbox.default.*; the gym default is ours, off at first. */
export const SANDBOX: readonly SandboxKind[] = [
  { id: "coffee", chip: "Coffee", kind: "coffee", min: 0, max: 300, dflt: 86, on: true },
  { id: "groceries", chip: "Groceries", kind: "groceries", min: 0, max: 1000, dflt: 412, on: true },
  { id: "streaming", chip: "Streaming", kind: "video", min: 0, max: 100, dflt: 47.97, on: true },
  { id: "rideshare", chip: "Rideshare", kind: "rideshare", min: 0, max: 400, dflt: 138, on: true },
  { id: "phone", chip: "Phone bill", kind: "phone", min: 0, max: 200, dflt: 65, on: true },
  { id: "gym", chip: "Gym", kind: "local", min: 0, max: 200, dflt: 40, on: false },
];

export interface SandboxState {
  [id: string]: { on: boolean; cents: number };
}

export function defaultSandbox(): SandboxState {
  return Object.fromEntries(SANDBOX.map((k) => [k.id, { on: k.on, cents: Math.round(k.dflt * 100) }]));
}

export function sandboxResult(state: SandboxState) {
  const choices = SANDBOX.filter((k) => state[k.id]?.on).map((k) => ({ kind: k.kind, amountCents: state[k.id].cents }));
  return buildYourMonth(choices, TREAT_BUDGET);
}

export function sandboxTally(state: SandboxState, base: string): string {
  const r = sandboxResult(state);
  const on = SANDBOX.filter((k) => state[k.id].on);
  if (on.length === 0) return `<p class="sb-empty">Nothing switched on. Tap a category to start a month.</p>`;
  const rows = on
    .map((k) => `<li><span>${esc(k.chip)}</span><b>${plain(state[k.id].cents)}</b></li>`)
    .join("");
  const basket = r.basket
    .map(
      (b) =>
        `<li class="tile tile-sm" aria-label="${esc(b.name)}, ${b.ticker}, ${money(b.treatCents)} of a $100.00 treat">` +
        `${logo(b.ticker, base)}<span class="tn">${esc(b.name)}<small>${b.ticker}</small></span><em>${money(b.treatCents)}</em></li>`,
    )
    .join("");
  const nothing = on
    .filter((k) => k.kind === "local")
    .map((k) => `<li class="nothing">${esc(k.chip)} maps to nothing you can own.</li>`)
    .join("");
  return (
    `<ul class="sb-rows">${rows}</ul>` +
    `<hr /><p class="s">of a $100.00 treat, in the same proportions</p>` +
    `<ul class="sb-basket">${basket}${nothing}</ul>`
  );
}

export function sandboxTotal(state: SandboxState): string {
  return money(sandboxResult(state).trickCents);
}

export { SAMPLE_OWNABLE_CENTS, SAMPLE_TOTAL_CENTS };

export function sandboxChips(): string {
  return SANDBOX.map(
    (k) =>
      `<li><button type="button" class="chip" data-id="${k.id}" aria-pressed="${k.on}" disabled>${esc(k.chip)}<small aria-hidden="true">${k.on ? "on" : "off"}</small></button></li>`,
  ).join("");
}

export function sandboxRows(): string {
  return SANDBOX.map((k) => {
    const c = Math.round(k.dflt * 100);
    return (
      `<div class="row" data-id="${k.id}"${k.on ? "" : " hidden"}>` +
      `<label for="sl-${k.id}">${esc(k.chip)}</label>` +
      `<input id="sl-${k.id}" type="range" min="${k.min}" max="${k.max}" step="1" value="${Math.round(k.dflt)}" aria-label="${esc(k.chip)}, dollars per month" aria-valuetext="${money(c)} a month" disabled />` +
      `<output for="sl-${k.id}">${money(c)}</output></div>`
    );
  }).join("");
}

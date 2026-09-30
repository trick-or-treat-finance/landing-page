import type { Company } from "./types";

/** The twelve listed companies the sample month can map to, in tile order. */
export const COMPANIES: readonly Company[] = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "GOOGL", name: "Alphabet" },
  { ticker: "WMT", name: "Walmart" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "SBUX", name: "Starbucks" },
  { ticker: "NFLX", name: "Netflix" },
  { ticker: "COST", name: "Costco" },
  { ticker: "UBER", name: "Uber" },
  { ticker: "SPOT", name: "Spotify" },
];

export function companyByTicker(ticker: string): Company {
  const found = COMPANIES.find((c) => c.ticker === ticker);
  if (!found) throw new RangeError(`unknown ticker: ${ticker}`);
  return found;
}

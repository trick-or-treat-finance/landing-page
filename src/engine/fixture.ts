import type { ReceiptLine } from "./types";

export const SAMPLE_TOTAL_CENTS = 481263; // $4,812.63
export const SAMPLE_OWNABLE_CENTS = 183547; // $1,835.47

const line = (
  id: string,
  merchant: string,
  category: string,
  amountCents: number,
  ticker?: string,
): ReceiptLine => (ticker ? { id, merchant, category, amountCents, ticker } : { id, merchant, category, amountCents });

/**
 * The sample September receipt. Ownable lines come first, in the order their
 * tiles land; rent, the corner restaurant and utilities map to nothing.
 */
export const SAMPLE_MONTH: readonly ReceiptLine[] = [
  line("walmart", "Walmart", "Groceries", 26841, "WMT"),
  line("costco", "Costco", "Groceries", 17389, "COST"),
  line("starbucks", "Starbucks", "Coffee & takeaway", 9624, "SBUX"),
  line("amazon", "Amazon", "Shopping", 40117, "AMZN"),
  line("apple", "Apple", "Phone & devices", 14999, "AAPL"),
  line("uber", "Uber", "Rideshare & transit", 14185, "UBER"),
  line("netflix", "Netflix", "Streaming", 2299, "NFLX"),
  line("spotify", "Spotify", "Streaming", 1199, "SPOT"),
  line("microsoft", "Microsoft", "Software", 5490, "MSFT"),
  line("google", "Google", "Cloud & apps", 7900, "GOOGL"),
  line("tesla", "Tesla", "EV charging & service", 11840, "TSLA"),
  line("nvidia", "NVIDIA", "Computer hardware", 31664, "NVDA"),
  line("rent", "Landlord", "Rent", 210000),
  line("corner", "Corner restaurant", "Local restaurant", 41236),
  line("utilities", "Utilities & insurance", "Utilities & insurance", 46480),
];

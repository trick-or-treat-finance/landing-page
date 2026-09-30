import type { ReceiptLine } from "./types";

export const SAMPLE_TOTAL_CENTS = 444988; // $4,449.88
export const SAMPLE_OWNABLE_CENTS = 248888; // $2,488.88

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
  line("walmart", "Walmart", "Groceries", 14236, "WMT"),
  line("costco", "Costco", "Groceries", 11890, "COST"),
  line("starbucks", "Starbucks", "Coffee & takeaway", 6485, "SBUX"),
  line("amazon", "Amazon", "Shopping", 8617, "AMZN"),
  line("apple", "Apple", "iPhone 18 Pro Max, 1TB", 189900, "AAPL"),
  line("uber", "Uber", "Rideshare & transit", 4720, "UBER"),
  line("netflix", "Netflix", "Streaming", 1999, "NFLX"),
  line("spotify", "Spotify", "Streaming", 1299, "SPOT"),
  line("microsoft", "Microsoft", "Xbox Game Pass Ultimate", 2299, "MSFT"),
  line("google", "Google", "YouTube Premium", 1599, "GOOGL"),
  line("doordash", "DoorDash", "Food delivery", 3845, "DASH"),
  line("nvidia", "NVIDIA", "GeForce NOW Ultimate", 1999, "NVDA"),
  line("rent", "Landlord", "Rent", 165000),
  line("corner", "Corner restaurant", "Local restaurant", 9640),
  line("utilities", "Utilities & insurance", "Utilities & insurance", 21460),
];

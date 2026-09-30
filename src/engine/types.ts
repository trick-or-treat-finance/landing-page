/** All money in the engine is integer cents. Nothing here touches the DOM. */

export interface Company {
  ticker: string;
  name: string;
}

export interface ReceiptLine {
  id: string;
  merchant: string;
  category: string;
  amountCents: number;
  /** Set only when the merchant maps to a listed company. */
  ticker?: string;
}

export interface BasketPart {
  ticker: string;
  name: string;
  /** Cents of the month spent with this company. */
  spendCents: number;
  /** Cents of the treat budget this company receives. */
  treatCents: number;
}

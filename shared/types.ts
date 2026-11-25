export type Direction = "debit" | "credit" | "unknown";
export type TxnStatus = "pending" | "done" | "ignored";
export type TxnKind = "personal" | "split";
export type TxnSource = "shortcut" | "manual" | "sample" | "import";

/**
 * Category colours (see styles.css: --c-<key>). The first eight are the
 * colour-blind-checked palette in its validated order; the next four give
 * more categories their own colour (every chart also labels them by name).
 */
export const COLOR_KEYS = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red", "brown", "cyan", "lime", "indigo", "gray"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: ColorKey;
  /** Monthly budget in the main currency, or null for none. */
  budget: number | null;
  sort: number;
}

export interface Transaction {
  id: string;
  hash: string;
  raw: string;
  received_at: string; // ISO timestamp
  amount: number;
  currency: string;
  merchant: string;
  direction: Direction;
  status: TxnStatus;
  kind: TxnKind | null;
  category_id: string | null;
  my_share: number | null;
  split_with: string | null;
  note: string | null;
  source: TxnSource;
  created_at: string;
  reviewed_at: string | null;
  /** For splits: friends have paid you back. */
  settled: boolean;
}

export interface Profile {
  name: string;
  currency: string;
  theme: "auto" | "light" | "dark";
  created_at: string;
}

export interface AppData {
  version: 1;
  profile: Profile | null;
  categories: Category[];
  transactions: Transaction[];
  /** merchantKey → category id, learned from your choices. */
  rules: Record<string, string>;
  last_backup_at: string | null;
}

export interface ReviewInput {
  kind: TxnKind;
  category_id: string | null;
  amount?: number;
  merchant?: string;
  my_share?: number | null;
  split_with?: string | null;
  note?: string | null;
}

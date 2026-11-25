export type Direction = "debit" | "credit" | "unknown";
export type TxnStatus = "pending" | "done" | "ignored";
export type TxnKind = "personal" | "split";

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  sort: number;
}

export interface Transaction {
  id: string;
  raw: string;
  sender: string | null;
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
  splitwise_expense_id: string | null;
  note: string | null;
  source: string; // "shortcut" | "manual" | "sample"
  created_at: string;
  reviewed_at: string | null;
  /** Only present on pending items returned by the API. */
  suggested_category_id?: string | null;
}

export interface Settings {
  currency: string;
  ingest_token: string;
  splitwise_connected: boolean;
}

export interface SplitwiseFriend {
  id: number;
  name: string;
}

export interface SplitwiseGroup {
  id: number;
  name: string;
  member_ids: number[];
}

export interface SplitwiseMeta {
  connected: boolean;
  me?: { id: number; name: string; default_currency?: string };
  friends: SplitwiseFriend[];
  groups: SplitwiseGroup[];
  error?: string;
}

export interface ReviewInput {
  kind: TxnKind;
  category_id: string | null;
  amount?: number;
  merchant?: string;
  my_share?: number | null;
  split_with?: string | null;
  note?: string | null;
  splitwise?: {
    group_id: number | null;
    friend_ids: number[];
  } | null;
}

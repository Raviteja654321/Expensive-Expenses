import type { Category, Transaction } from "../../../shared/types";
import { monthKey, round2 } from "./format";

/** What an expense cost *you*: your share for splits, the full amount otherwise. */
export const spendOf = (t: Transaction) => t.my_share ?? t.amount;

export function monthBounds(key: string): { from: Date; to: Date; days: number } {
  const [y, m] = key.split("-").map(Number);
  const from = new Date(y, m - 1, 1);
  const to = new Date(y, m, 1);
  return { from, to, days: new Date(y, m, 0).getDate() };
}

export function inMonth(t: Transaction, key: string): boolean {
  return monthKey(new Date(t.received_at)) === key;
}

/** Reviewed expenses in the main currency (other currencies are reported separately). */
export function expenses(all: Transaction[], currency: string): Transaction[] {
  return all.filter((t) => t.status === "done" && t.currency === currency);
}

export const sum = (list: Transaction[]) => round2(list.reduce((s, t) => s + spendOf(t), 0));

export function monthTotals(list: Transaction[], endKey: string, count: number): { key: string; total: number }[] {
  const [y, m] = endKey.split("-").map(Number);
  const out: { key: string; total: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = monthKey(new Date(y, m - 1 - i, 1));
    out.push({ key, total: sum(list.filter((t) => inMonth(t, key))) });
  }
  return out;
}

export function dailyTotals(list: Transaction[], key: string): number[] {
  const { days } = monthBounds(key);
  const out = new Array<number>(days).fill(0);
  for (const t of list) {
    if (!inMonth(t, key)) continue;
    const d = new Date(t.received_at).getDate();
    out[d - 1] = round2(out[d - 1] + spendOf(t));
  }
  return out;
}

export interface CatTotal {
  id: string; // category id or "none"
  category: Category | undefined;
  total: number;
  count: number;
}

export function byCategory(list: Transaction[], categories: Category[]): CatTotal[] {
  const map = new Map<string, CatTotal>();
  const byId = new Map(categories.map((c) => [c.id, c]));
  for (const t of list) {
    const id = t.category_id && byId.has(t.category_id) ? t.category_id : "none";
    const cur = map.get(id) ?? { id, category: byId.get(id), total: 0, count: 0 };
    cur.total = round2(cur.total + spendOf(t));
    cur.count += 1;
    map.set(id, cur);
  }
  return [...map.values()].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
}

export function byMerchant(list: Transaction[]): { merchant: string; total: number; count: number }[] {
  const map = new Map<string, { merchant: string; total: number; count: number }>();
  for (const t of list) {
    const k = t.merchant.toLowerCase();
    const cur = map.get(k) ?? { merchant: t.merchant, total: 0, count: 0 };
    cur.total = round2(cur.total + spendOf(t));
    cur.count += 1;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Average spend per weekday (Mon..Sun) over the given days ending today. */
export function weekdayAverages(list: Transaction[], now: Date, days = 84): number[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const totals = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    counts[(d.getDay() + 6) % 7] += 1;
  }
  for (const t of list) {
    const d = new Date(t.received_at);
    if (d < start || d > now) continue;
    totals[(d.getDay() + 6) % 7] += spendOf(t);
  }
  return totals.map((v, i) => (counts[i] ? round2(v / counts[i]) : 0));
}

export interface FriendBalance {
  name: string;
  owed: number;
  splits: Transaction[];
}

/** Unsettled amounts friends owe you, the non-you part of each split divided equally among the names. */
export function friendBalances(all: Transaction[]): FriendBalance[] {
  const map = new Map<string, FriendBalance>();
  for (const t of all) {
    if (t.status !== "done" || t.kind !== "split" || t.settled) continue;
    const names = (t.split_with ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const rest = t.amount - (t.my_share ?? 0);
    if (rest <= 0) continue;
    const people = names.length ? names : ["Friends"];
    const each = rest / people.length;
    for (const n of people) {
      const k = n.toLowerCase();
      const cur = map.get(k) ?? { name: n, owed: 0, splits: [] };
      cur.owed = round2(cur.owed + each);
      cur.splits.push(t);
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.owed - a.owed);
}

/** Spend in a month up to (and including) a given day of month. */
export function monthToDate(list: Transaction[], key: string, uptoDay: number): number {
  return sum(list.filter((t) => inMonth(t, key) && new Date(t.received_at).getDate() <= uptoDay));
}

export function previousMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 2, 1));
}

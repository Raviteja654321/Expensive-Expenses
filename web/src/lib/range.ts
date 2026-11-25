import type { Category, Transaction } from "../../../shared/types";
import { round2 } from "./format";
import { spendOf } from "./stats";

export type Preset = "this-month" | "last-month" | "last-30" | "last-90" | "this-year" | "all" | "custom";

export const PRESETS: { key: Preset; label: string }[] = [
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-90", label: "Last 3 months" },
  { key: "this-year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

export interface DateRange {
  preset: Preset;
  /** Inclusive local dates, "YYYY-MM-DD". */
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function presetRange(preset: Preset, now: Date, earliest?: string | null): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  switch (preset) {
    case "last-month":
      return { preset, from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)) };
    case "last-30":
      return { preset, from: ymd(daysAgo(29)), to: ymd(today) };
    case "last-90":
      return { preset, from: ymd(daysAgo(89)), to: ymd(today) };
    case "this-year":
      return { preset, from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
    case "all":
      return { preset, from: earliest ? earliest.slice(0, 10) : ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
    case "custom":
    case "this-month":
    default:
      return { preset, from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
  }
}

/** Transactions whose local date falls inside the range (inclusive). */
export function inRange(list: Transaction[], r: DateRange): Transaction[] {
  const from = parseYmd(r.from).getTime();
  const to = parseYmd(r.to).getTime() + 86_400_000;
  return list.filter((t) => {
    const at = Date.parse(t.received_at);
    return at >= from && at < to;
  });
}

export function rangeDays(r: DateRange, now = new Date()): number {
  const end = Math.min(parseYmd(r.to).getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime());
  return Math.max(1, Math.round((end - parseYmd(r.from).getTime()) / 86_400_000) + 1);
}

export interface Bucket {
  key: string;
  label: string;
  title: string;
  segments: { key: string; label: string; value: number; color: string }[];
  total: number;
}

/**
 * Splits the range into days (up to ~2 months) or months, each broken down by
 * category: the top `maxCats` categories by spend keep their colour, the rest
 * fold into "Other".
 */
export function categoryBuckets(list: Transaction[], categories: Category[], r: DateRange, maxCats = 8): Bucket[] {
  const items = inRange(list, r);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const t of items) {
    const k = t.category_id && catById.has(t.category_id) ? t.category_id : "none";
    totals.set(k, (totals.get(k) ?? 0) + spendOf(t));
  }
  const top = new Set([...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCats).map(([k]) => k));
  const from = parseYmd(r.from);
  const to = parseYmd(r.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const daily = days <= 62;
  const keys: { key: string; label: string; title: string; start: number; end: number }[] = [];
  if (daily) {
    for (let i = 0; i < days; i++) {
      const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
      const n = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const every = days > 31 ? 7 : 5;
      keys.push({
        key: ymd(d),
        label: i === 0 || (i + 1) % every === 0 ? String(d.getDate()) : "",
        title: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
        start: d.getTime(),
        end: n.getTime(),
      });
    }
  } else {
    let d = new Date(from.getFullYear(), from.getMonth(), 1);
    const months = (to.getFullYear() - d.getFullYear()) * 12 + to.getMonth() - d.getMonth() + 1;
    for (let i = 0; i < months; i++) {
      const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      keys.push({
        key: ymd(d),
        label: months > 8 && i % 2 === 1 ? "" : d.toLocaleDateString(undefined, { month: "short" }),
        title: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        start: Math.max(d.getTime(), from.getTime()),
        end: Math.min(n.getTime(), to.getTime() + 86_400_000),
      });
      d = n;
    }
  }
  return keys.map((b) => {
    const seg = new Map<string, number>();
    for (const t of items) {
      const at = Date.parse(t.received_at);
      if (at < b.start || at >= b.end) continue;
      const raw = t.category_id && catById.has(t.category_id) ? t.category_id : "none";
      const k = top.has(raw) ? raw : "other";
      seg.set(k, (seg.get(k) ?? 0) + spendOf(t));
    }
    const segments = [...seg.entries()]
      .map(([k, v]) => {
        const c = catById.get(k);
        return {
          key: k,
          label: c ? `${c.emoji} ${c.name}` : k === "none" ? "Uncategorized" : "Other",
          value: round2(v),
          color: c ? `var(--c-${c.color})` : "var(--c-gray)",
        };
      })
      .sort((a, b) => b.value - a.value);
    return { key: b.key, label: b.label, title: b.title, segments, total: round2(segments.reduce((a, s) => a + s.value, 0)) };
  });
}

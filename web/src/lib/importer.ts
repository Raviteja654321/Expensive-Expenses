/**
 * Import expenses from a CSV export (Notion, Google Sheets, Excel...).
 * Pure functions: parse → preview → merge into AppData.
 */
import { merchantKey } from "../../../shared/categorize";
import type { AppData, Category, ColorKey, Transaction } from "../../../shared/types";
import { hashText, uid, ValidationError } from "./actions";
import { round2 } from "./format";

/** RFC 4180-ish CSV parser: quoted fields, escaped quotes, commas/newlines inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface ImportRow {
  /** Local date "YYYY-MM-DD", optionally with "THH:MM". */
  date: string;
  amount: number;
  title: string;
  categories: string[];
  note: string | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Accepts 2025-09-01, 2025-09-01T10:30, "September 1, 2025", "1 Sep 2025", 01/09/2025 (day first), 2025/09/01. */
export function parseLooseDate(input: string): string | null {
  const s = input.split(/→|->/)[0].trim(); // Notion date ranges: keep the start
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3], m[4] ? +m[4] : null, m[5] ? +m[5] : null);
  m = /^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm)?)?/i.exec(s);
  if (m) return build(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2], ...time(m[4], m[5], m[6]));
  m = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})/i.exec(s);
  if (m) return build(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1], null, null);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(s);
  if (m) return build(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1], null, null);
  return null;
}

function time(h?: string, min?: string, ap?: string): [number | null, number | null] {
  if (!h) return [null, null];
  let hh = +h;
  if (ap?.toLowerCase() === "pm" && hh < 12) hh += 12;
  if (ap?.toLowerCase() === "am" && hh === 12) hh = 0;
  return [hh, +(min ?? 0)];
}

function build(y: number, mo: number, d: number, hh: number | null, mm: number | null): string | null {
  if (!(y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(mo)}-${pad(d)}${hh != null ? `T${pad(hh)}:${pad(mm ?? 0)}` : ""}`;
}

export function parseAmount(input: string): number | null {
  const s = input.replace(/[₹$€£,\s]|rs\.?|inr/gi, "");
  if (!s || /^\(.*\)$/.test(s) || s.startsWith("-")) return null; // empty, refunds/negatives
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

const COLS: Record<keyof Omit<ImportRow, "categories"> | "category", RegExp> = {
  title: /^(expense|name|title|description|item|merchant|payee|details?|particulars|narration)$/i,
  amount: /^(amount|cost|price|spent|value|debit|total|inr|amount \(.*\))$/i,
  category: /^(category|categories|tags?|type|label)$/i,
  date: /^(date|day|when|transaction date|txn date|value date|created|created time)$/i,
  note: /^(notes?|remarks?|comments?|memo)$/i,
};

export interface ImportPreview {
  rows: ImportRow[];
  skipped: number;
  columns: string[];
  from: string | null;
  to: string | null;
  total: number;
  categories: string[];
}

export function previewCsv(text: string): ImportPreview {
  const table = parseCsv(text);
  if (table.length < 2) throw new ValidationError("That file has no rows.");
  const header = table[0].map((h) => h.trim());
  const find = (re: RegExp, loose?: RegExp) => {
    let i = header.findIndex((h) => re.test(h));
    if (i < 0 && loose) i = header.findIndex((h) => loose.test(h));
    return i;
  };
  const ci = {
    title: find(COLS.title),
    amount: find(COLS.amount, /amount|cost|price/i),
    category: find(COLS.category, /categor|tag/i),
    date: find(COLS.date, /date/i),
    note: find(COLS.note),
  };
  if (ci.amount < 0 || ci.date < 0) {
    throw new ValidationError(`Couldn't find Date and Amount columns. Found: ${header.join(", ")}`);
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const amount = parseAmount(r[ci.amount] ?? "");
    const date = parseLooseDate(r[ci.date] ?? "");
    if (amount == null || !date) {
      skipped++;
      continue;
    }
    rows.push({
      date,
      amount,
      title: (ci.title >= 0 ? r[ci.title] : "").trim().slice(0, 80),
      categories: ci.category >= 0 ? (r[ci.category] ?? "").split(",").map((c) => c.trim()).filter(Boolean) : [],
      note: ci.note >= 0 ? (r[ci.note] ?? "").trim() || null : null,
    });
  }
  const dates = rows.map((r) => r.date.slice(0, 10)).sort();
  const cats = [...new Set(rows.flatMap((r) => r.categories.slice(0, 1)))];
  return {
    rows,
    skipped,
    columns: Object.entries(ci).filter(([, i]) => i >= 0).map(([k, i]) => `${k}: ${header[i]}`),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    total: round2(rows.reduce((a, r) => a + r.amount, 0)),
    categories: cats,
  };
}

/** Category names that mean the same thing; the imported name wins (it's what you've been using). */
const SYNONYMS: string[][] = [
  ["transportation", "transport"],
  ["healthcare", "health"],
];

export interface ImportResult {
  data: AppData;
  added: number;
  duplicates: number;
  created: string[];
  renamed: [string, string][];
}

export function importRows(data: AppData, rows: ImportRow[], now = new Date()): ImportResult {
  const currency = data.profile?.currency ?? "INR";
  let categories: Category[] = data.categories.map((c) => ({ ...c }));
  const created: string[] = [];
  const renamed: [string, string][] = [];
  const byName = () => new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  // Create missing categories, biggest spend first so they get the most distinct colours.
  const spendByCat = new Map<string, number>();
  for (const r of rows) {
    const c = r.categories[0];
    if (c) spendByCat.set(c, (spendByCat.get(c) ?? 0) + r.amount);
  }
  // Colours already "taken" are only those of categories that actually have expenses,
  // so unused defaults don't crowd out the categories you really use.
  const importedNames = new Set([...spendByCat.keys()].map((n) => n.toLowerCase()));
  const inUse = new Set(data.transactions.map((t) => t.category_id).filter(Boolean));
  const taken = () =>
    new Set(categories.filter((c) => inUse.has(c.id) || importedNames.has(c.name.toLowerCase())).map((c) => c.color));
  const palette: ColorKey[] = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red", "brown", "cyan", "lime", "indigo"];
  const order = [...spendByCat.keys()].sort((a, b) => spendByCat.get(b)! - spendByCat.get(a)!);
  // Renames first, so renamed categories keep (and reserve) their colour.
  for (const name of order) {
    const map = byName();
    if (map.has(name.toLowerCase())) continue;
    const syn = SYNONYMS.find((g) => g.includes(name.toLowerCase()));
    const existing = syn?.map((n) => map.get(n)).find(Boolean);
    if (existing) {
      renamed.push([existing.name, name]);
      existing.name = name;
    }
  }
  let cycle = 0;
  for (const name of order) {
    if (byName().has(name.toLowerCase())) continue;
    const used = taken();
    const color: ColorKey = /random|misc|other/i.test(name) ? "gray" : (palette.find((k) => !used.has(k)) ?? palette[cycle++ % palette.length]);
    categories.push({ id: uid(), name: name.slice(0, 40), emoji: guessEmoji(name), color, budget: null, sort: categories.length });
    created.push(name);
  }

  const map = byName();
  const hashes = new Set(data.transactions.map((t) => t.hash));
  const seen = new Map<string, number>();
  const rules = { ...data.rules };
  const added: Transaction[] = [];
  let duplicates = 0;

  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const base = `${r.date}|${r.amount}|${r.title.toLowerCase()}|${r.categories.join(",").toLowerCase()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const hash = `imp:${hashText(base)}:${n}`;
    if (hashes.has(hash)) {
      duplicates++;
      continue;
    }
    hashes.add(hash);
    const primary = r.categories[0] ? map.get(r.categories[0].toLowerCase()) : undefined;
    const others = r.categories.slice(1);
    const note = [r.note, others.length ? `Also tagged: ${others.join(", ")}` : null].filter(Boolean).join(" · ") || null;
    const [y, mo, d] = r.date.slice(0, 10).split("-").map(Number);
    const [hh, mm] = r.date.length > 10 ? r.date.slice(11).split(":").map(Number) : [12, 0];
    const merchant = r.title || primary?.name || "Imported expense";
    added.push({
      id: uid(),
      hash,
      raw: `Imported: ${merchant} · ${r.amount}${r.categories.length ? ` · ${r.categories.join(", ")}` : ""}`,
      received_at: new Date(y, mo - 1, d, hh, mm).toISOString(),
      amount: r.amount,
      currency,
      merchant,
      direction: "debit",
      status: "done",
      kind: "personal",
      category_id: primary?.id ?? null,
      my_share: r.amount,
      split_with: null,
      note,
      source: "import",
      created_at: now.toISOString(),
      reviewed_at: now.toISOString(),
      settled: false,
    });
    // Learn merchant → category, so future bank SMS from the same place are pre-filled.
    const key = r.title ? merchantKey(r.title) : "";
    if (key && primary) rules[key] = primary.id;
  }

  categories = categories.map((c, i) => ({ ...c, sort: i }));
  return {
    data: { ...data, categories, rules, transactions: [...data.transactions, ...added] },
    added: added.length,
    duplicates,
    created,
    renamed,
  };
}

const EMOJI: [RegExp, string][] = [
  [/daily food|lunch|meal/i, "🍱"],
  [/food|dining|restaurant/i, "🍔"],
  [/grocer/i, "🛒"],
  [/vacay ?transport|flight/i, "🛫"],
  [/transport|travel|cab|commute/i, "🚕"],
  [/vacation|trip|holiday/i, "🏖️"],
  [/hous|rent|home/i, "🏠"],
  [/personal util/i, "🧴"],
  [/util|bill|electric|internet|wifi|phone/i, "💡"],
  [/entertain|movie|fun/i, "🎬"],
  [/shop/i, "🛍️"],
  [/health|medic|pharm|doctor/i, "💊"],
  [/weekend/i, "🎉"],
  [/friend/i, "🧑‍🤝‍🧑"],
  [/family|parent/i, "👨‍👩‍👧"],
  [/sport|gym|fitness/i, "🏸"],
  [/pelli|wedding|marriage/i, "💍"],
  [/gift/i, "🎁"],
  [/random|misc|other/i, "🎲"],
];

export function guessEmoji(name: string): string {
  return EMOJI.find(([re]) => re.test(name))?.[1] ?? "🏷️";
}

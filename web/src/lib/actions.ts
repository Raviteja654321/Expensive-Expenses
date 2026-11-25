/**
 * Pure state transitions for the app's data. Everything here is synchronous and
 * DOM-free so it can be unit-tested; the React store just calls these.
 */
import { DEFAULT_CATEGORIES, merchantKey, suggestCategoryName } from "../../../shared/categorize";
import { extractDate, parseSms, splitMessages } from "../../../shared/parser";
import type { AppData, Category, ColorKey, Profile, ReviewInput, Transaction, TxnSource } from "../../../shared/types";
import { round2 } from "./format";

const g = globalThis as { crypto?: { randomUUID?: () => string } };
export const uid = () => g.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Small, fast, non-cryptographic hash (cyrb53) used only to spot duplicate SMS. */
export function hashText(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function emptyData(): AppData {
  return { version: 1, profile: null, categories: [], transactions: [], rules: {}, last_backup_at: null };
}

export function createProfile(data: AppData, p: { name: string; currency: string }, now = new Date()): AppData {
  const profile: Profile = { name: p.name.trim().slice(0, 40), currency: p.currency, theme: "auto", created_at: now.toISOString() };
  const categories: Category[] = data.categories.length
    ? data.categories
    : DEFAULT_CATEGORIES.map((c, i) => ({ id: uid(), name: c.name, emoji: c.emoji, color: c.color, budget: null, sort: i }));
  return { ...data, profile, categories };
}

// ---------- importing messages ----------

export interface IngestEntry {
  text: string;
  /** Exact arrival time, when the iPhone Shortcut supplied one (ISO 8601 with time zone). */
  at?: string | null;
}

export interface IngestResult {
  text: string;
  status: "queued" | "duplicate" | "ignored";
  reason?: string;
  txn?: Transaction;
}

const ISO_PREFIX_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))\s*/;

/**
 * Splits the text an iPhone Shortcut hands over. Entries are separated by lines
 * starting with "###", optionally followed by an ISO timestamp. Without any "###",
 * messages are separated by blank lines (handy for pasting).
 */
export function splitInbox(text: string): IngestEntry[] {
  const clean = text.replace(/\r\n?/g, "\n");
  if (!/^\s*###/m.test(clean)) return splitMessages(clean).map((t) => ({ text: t }));
  return clean
    .split(/^\s*###[ \t]*/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = ISO_PREFIX_RE.exec(chunk);
      return m ? { text: chunk.slice(m[0].length).trim(), at: m[1] } : { text: chunk };
    })
    .filter((e) => e.text);
}

/** Reads `#inbox=…` / `#add=…` (or the same as query parameters) from a URL. */
export function readInboxFromUrl(hash: string, search = ""): string | null {
  const grab = (s: string) => {
    const m = /(?:^|[#?&])(inbox|add)=([\s\S]*)/.exec(s);
    if (!m) return null;
    let raw = m[2];
    const amp = raw.search(/&(?:inbox|add)=/);
    if (amp >= 0) raw = raw.slice(0, amp);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };
  return grab(hash) ?? grab(search);
}

function receivedAt(entry: IngestEntry, text: string, currency: string | null, now: Date): string {
  if (entry.at) {
    const t = Date.parse(entry.at);
    if (!Number.isNaN(t) && t <= now.getTime() + 5 * 60_000) return new Date(t).toISOString();
  }
  const d = extractDate(text, currency, now.getFullYear());
  if (d) {
    const sameDay = d.y === now.getFullYear() && d.m === now.getMonth() + 1 && d.d === now.getDate();
    if (!(sameDay && d.hh == null)) {
      const local = new Date(d.y, d.m - 1, d.d, d.hh ?? 12, d.mm ?? 0);
      const age = now.getTime() - local.getTime();
      if (age >= -5 * 60_000 && age < 400 * 86_400_000) return local.toISOString();
    }
  }
  return now.toISOString();
}

export function ingestMessages(
  data: AppData,
  entries: IngestEntry[],
  source: TxnSource,
  now = new Date(),
): { data: AppData; results: IngestResult[] } {
  const currency = data.profile?.currency ?? "INR";
  const hashes = new Set(data.transactions.map((t) => t.hash));
  const added: Transaction[] = [];
  const results: IngestResult[] = [];

  for (const entry of entries.slice(0, 500)) {
    const text = entry.text.trim();
    const preview = text.slice(0, 80);
    const parsed = parseSms(text);
    if (!parsed.isTransaction || parsed.amount == null) {
      results.push({ text: preview, status: "ignored", reason: parsed.reason ?? "not a spend" });
      continue;
    }
    const hash = hashText(text.replace(/\s+/g, " ").toLowerCase());
    if (hashes.has(hash)) {
      results.push({ text: preview, status: "duplicate", reason: "already added" });
      continue;
    }
    hashes.add(hash);
    const txn: Transaction = {
      id: uid(),
      hash,
      raw: text,
      received_at: receivedAt(entry, text, parsed.currency, now),
      amount: round2(parsed.amount),
      currency: parsed.currency ?? currency,
      merchant: parsed.merchant ?? "Unknown merchant",
      direction: parsed.direction,
      status: "pending",
      kind: null,
      category_id: null,
      my_share: null,
      split_with: null,
      note: null,
      source,
      created_at: now.toISOString(),
      reviewed_at: null,
      settled: false,
    };
    added.push(txn);
    results.push({ text: preview, status: "queued", txn });
  }
  return { data: added.length ? { ...data, transactions: [...data.transactions, ...added] } : data, results };
}

// ---------- reviewing ----------

export function suggestCategory(data: AppData, merchant: string): string | null {
  const key = merchantKey(merchant);
  const ruled = key ? data.rules[key] : undefined;
  if (ruled && data.categories.some((c) => c.id === ruled)) return ruled;
  const name = suggestCategoryName(merchant);
  return name ? (data.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null) : null;
}

export class ValidationError extends Error {}

function updateTxn(data: AppData, id: string, fn: (t: Transaction) => Transaction): AppData {
  let found = false;
  const transactions = data.transactions.map((t) => {
    if (t.id !== id) return t;
    found = true;
    return fn(t);
  });
  if (!found) throw new ValidationError("That transaction no longer exists.");
  return { ...data, transactions };
}

export function reviewTxn(data: AppData, id: string, input: ReviewInput, now = new Date()): AppData {
  const txn = data.transactions.find((t) => t.id === id);
  if (!txn) throw new ValidationError("That transaction no longer exists.");
  const amount = input.amount != null ? Number(input.amount) : txn.amount;
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError("The amount must be more than zero.");
  if (input.category_id && !data.categories.some((c) => c.id === input.category_id)) throw new ValidationError("That category no longer exists.");
  let myShare = amount;
  let splitWith: string | null = null;
  if (input.kind === "split") {
    myShare = Number(input.my_share);
    if (!Number.isFinite(myShare) || myShare < 0 || myShare > amount + 0.001) throw new ValidationError("Your share must be between 0 and the full amount.");
    splitWith = input.split_with?.trim().slice(0, 200) || null;
  }
  const merchant = input.merchant?.trim().slice(0, 80) || txn.merchant;
  let next = updateTxn(data, id, (t) => ({
    ...t,
    status: "done",
    kind: input.kind,
    category_id: input.category_id ?? null,
    amount: round2(amount),
    merchant,
    my_share: round2(myShare),
    split_with: splitWith,
    note: input.note === undefined ? t.note : input.note?.trim().slice(0, 300) || null,
    reviewed_at: now.toISOString(),
    settled: input.kind === "split" ? t.settled : false,
  }));
  const key = merchantKey(merchant);
  if (input.category_id && key) next = { ...next, rules: { ...next.rules, [key]: input.category_id } };
  return next;
}

export const ignoreTxn = (data: AppData, id: string, now = new Date()) =>
  updateTxn(data, id, (t) => ({ ...t, status: "ignored", reviewed_at: now.toISOString() }));

export const reopenTxn = (data: AppData, id: string) =>
  updateTxn(data, id, (t) => ({ ...t, status: "pending", kind: null, category_id: null, my_share: null, split_with: null, reviewed_at: null, settled: false }));

export const deleteTxn = (data: AppData, id: string): AppData => ({ ...data, transactions: data.transactions.filter((t) => t.id !== id) });

export function settleFriend(data: AppData, name: string, settled = true): AppData {
  const k = name.toLowerCase();
  return {
    ...data,
    transactions: data.transactions.map((t) =>
      t.kind === "split" && t.status === "done" && (t.split_with ?? "Friends").split(",").some((n) => n.trim().toLowerCase() === k)
        ? { ...t, settled }
        : t,
    ),
  };
}

// ---------- categories ----------

export function addCategory(data: AppData, c: { name: string; emoji?: string; color?: ColorKey; budget?: number | null }): { data: AppData; category: Category } {
  const name = c.name.trim().slice(0, 40);
  if (!name) throw new ValidationError("Give the category a name.");
  if (data.categories.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new ValidationError(`“${name}” already exists.`);
  const used = new Set(data.categories.map((x) => x.color));
  const color = c.color ?? (["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"] as ColorKey[]).find((k) => !used.has(k)) ?? "gray";
  const category: Category = {
    id: uid(),
    name,
    emoji: c.emoji?.trim().slice(0, 8) || "🏷️",
    color,
    budget: c.budget ?? null,
    sort: Math.max(-1, ...data.categories.map((x) => x.sort)) + 1,
  };
  return { data: { ...data, categories: [...data.categories, category] }, category };
}

export function updateCategory(data: AppData, id: string, patch: Partial<Omit<Category, "id" | "sort">>): AppData {
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 40);
    if (!name) throw new ValidationError("Name can't be empty.");
    if (data.categories.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new ValidationError(`“${name}” already exists.`);
    patch = { ...patch, name };
  }
  if (patch.budget !== undefined && patch.budget !== null && (!Number.isFinite(patch.budget) || patch.budget < 0)) {
    throw new ValidationError("Budget must be a positive number.");
  }
  return { ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function deleteCategory(data: AppData, id: string): AppData {
  const rules = Object.fromEntries(Object.entries(data.rules).filter(([, v]) => v !== id));
  return {
    ...data,
    rules,
    categories: data.categories.filter((c) => c.id !== id),
    transactions: data.transactions.map((t) => (t.category_id === id ? { ...t, category_id: null } : t)),
  };
}

export function reorderCategories(data: AppData, ids: string[]): AppData {
  const pos = new Map(ids.map((id, i) => [id, i]));
  return { ...data, categories: data.categories.map((c) => ({ ...c, sort: pos.get(c.id) ?? c.sort })).sort((a, b) => a.sort - b.sort) };
}

// ---------- backup ----------

export function validateBackup(raw: unknown): AppData {
  const d = raw as Partial<AppData> | null;
  if (!d || typeof d !== "object" || d.version !== 1 || !Array.isArray(d.transactions) || !Array.isArray(d.categories)) {
    throw new ValidationError("That file isn't an Expensive Expenses backup.");
  }
  return {
    version: 1,
    profile: d.profile ?? null,
    categories: d.categories,
    transactions: d.transactions.map((t) => ({ ...t, settled: !!t.settled })),
    rules: d.rules ?? {},
    last_backup_at: d.last_backup_at ?? null,
  };
}

/** Adds what's in the backup that isn't here yet (matched by message), keeping your current data. */
export function mergeBackup(current: AppData, backup: AppData): { data: AppData; added: number } {
  const catByName = new Map(current.categories.map((c) => [c.name.toLowerCase(), c]));
  const categories = [...current.categories];
  const idMap = new Map<string, string>();
  for (const c of backup.categories) {
    const existing = catByName.get(c.name.toLowerCase());
    if (existing) idMap.set(c.id, existing.id);
    else {
      const copy = { ...c, sort: categories.length };
      categories.push(copy);
      catByName.set(c.name.toLowerCase(), copy);
      idMap.set(c.id, c.id);
    }
  }
  const hashes = new Set(current.transactions.map((t) => t.hash));
  const incoming = backup.transactions
    .filter((t) => !hashes.has(t.hash))
    .map((t) => ({ ...t, category_id: t.category_id ? (idMap.get(t.category_id) ?? null) : null }));
  const rules = { ...Object.fromEntries(Object.entries(backup.rules).map(([k, v]) => [k, idMap.get(v) ?? v])), ...current.rules };
  return {
    data: { ...current, profile: current.profile ?? backup.profile, categories, rules, transactions: [...current.transactions, ...incoming] },
    added: incoming.length,
  };
}

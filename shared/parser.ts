import type { Direction } from "./types";

export interface ParsedSms {
  /** false when the message is clearly not a spend (OTP, credit, reminder, no amount). */
  isTransaction: boolean;
  /** Why the message was skipped, when isTransaction is false. */
  reason?: string;
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  direction: Direction;
}

const DEBIT_RE =
  /\b(debited|debit(?:ed)? (?:of|for|by|with)|spent|sent|paid|charged|withdrawn|withdrawal|purchase[d]?|deducted|transaction of|txn of|made a|charge of|used (?:for|at))\b/i;
// Past-tense words that only appear once money has actually left the account.
const STRONG_DEBIT_RE = /\b(debited|spent|sent|paid|charged|withdrawn|deducted)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|refund(?:ed)?|reversed|reversal|cashback)\b/i;
const OTP_RE = /\b(otp|one[\s-]?time[\s-]?pass(?:word|code)?|verification code|security code)\b/i;
const REMINDER_RE =
  /\b(will be (?:debited|charged|deducted|auto[\s-]?debited)|is due|due (?:on|by|date)|requested (?:money|rs|inr|₹)|has requested|payment request|collect request|mandate (?:created|registered))\b/i;

// Currency token, not glued to a preceding letter (so "hrs"/"Mrs" never count).
const CUR = String.raw`(?<![a-z0-9])(₹|rs\.?|inr|usd|us\$|\$|eur|€|£|gbp|aed|sgd|cad|aud)`;
// 1,23,456.00 | 1,234.56 | 1234 | 12.5
const AMT = String.raw`([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)`;
const CUR_AMT_RE = new RegExp(`${CUR}\\s*${AMT}`, "gi");
const BALANCE_BEFORE_RE = /(bal|balance|limit|avl|avbl|available|outstanding|total due|min(?:imum)? due)[^a-z0-9]{0,4}(?:is|of|:)?[^a-z0-9]{0,3}$/i;
const VERB_AMT_RE = new RegExp(
  String.raw`\b(?:debited|spent|paid|sent|charged|withdrawn|deducted)\s+(?:by|for|with|of)?\s*(?:an?\s+amount\s+of\s+)?${AMT}\b`,
  "i",
);

function currencyCode(token: string): string {
  const t = token.toLowerCase().replace(/\.$/, "");
  if (t === "₹" || t === "rs" || t === "inr") return "INR";
  if (t === "$" || t === "usd" || t === "us$") return "USD";
  if (t === "€" || t === "eur") return "EUR";
  if (t === "£" || t === "gbp") return "GBP";
  return t.toUpperCase();
}

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ""));
}

export function extractAmount(text: string): { amount: number; currency: string | null } | null {
  for (const m of text.matchAll(CUR_AMT_RE)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index);
    if (BALANCE_BEFORE_RE.test(before)) continue;
    const n = toNumber(m[2]);
    if (!Number.isFinite(n) || n <= 0) continue;
    return { amount: n, currency: currencyCode(m[1]) };
  }
  const v = VERB_AMT_RE.exec(text);
  if (v) {
    const n = toNumber(v[1]);
    if (Number.isFinite(n) && n > 0) return { amount: n, currency: null };
  }
  return null;
}

// Ordered from most specific to most generic. Group 1 is the merchant.
const MERCHANT_PATTERNS: RegExp[] = [
  /UPI\/P2[MA]\/\d+\/([^\n\/]+?)(?:\/|\n|$)/gi, // Axis: UPI/P2M/4321/PVR INOX LTD
  /\binfo\s*[:\-]\s*(?:upi[\/\-])?(?:p2[ma][\/\-]\d+[\/\-])?([^\n]+?)(?:\.\s|\.$|\s+avl\b|\s+avbl\b|\s*\n|$)/gi,
  /\btransaction with\s+(.+?)\s+on\s/gi, // Chase
  /\bon\s+\d{1,2}[-\/ ]?[a-z]{3}[-\/ ]?\d{2,4}\s+(?:on|at)\s+(.+?)(?:\.\s|\.$|\s+avl\b|\n|$)/gi, // ICICI card
  /;\s*(.+?)\s+credited\b/gi, // ICICI UPI: "; UBER INDIA credited"
  /\btrf to\s+(.+?)\s+(?:ref(?:no)?\b|on\b|upi\b)/gi, // SBI
  /\bat\s+(.+?)(?:\s+on\s|\s+on$|\s+was\b|\s+using\b|\s+via\b|\s+for\b|\.\s|\.$|,|\n|$)/gi,
  /\bto\s+(?:vpa\s+)?(.+?)(?:\s+on\b|\s+ref\b|\s+upi\b|\s+via\b|\s+using\b|\s+from\b|\s*\(|\.\s|\.$|,|\n|$)/gi,
  /\btowards\s+(.+?)(?:\.\s|\.$|\s+avl\b|\s+on\b|,|\n|$)/gi,
];

const BAD_START_RE =
  /^(your|the|a\/c|ac\b|acct|account|card|bank|you\b|rs\b|inr\b|block|dispute|customer|cust|beneficiary|self\b|sms\b|call\b|https?:)/i;

const KEEP_UPPER = new Set(["ltd", "pvt", "llp", "inc", "co"]);

function titleCase(s: string): string {
  if (/[a-z]/.test(s)) return s; // already mixed case: keep as written
  return s
    .split(/(\s+)/)
    .map((w) => {
      const lw = w.toLowerCase();
      if (KEEP_UPPER.has(lw.replace(/\.$/, ""))) return lw.charAt(0).toUpperCase() + lw.slice(1);
      // Short words without vowels are usually acronyms (KFC, PVR, BMS).
      if (w.length <= 3 && !/[aeiou]/i.test(w)) return w;
      return lw.charAt(0).toUpperCase() + lw.slice(1);
    })
    .join("");
}

export function cleanMerchant(raw: string): string | null {
  let s = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(vpa|upi|m\/s\.?)[\s:\-\/]+/i, "")
    .replace(/^(upi|imps|neft|pos|ecom)[\-\/]/i, "")
    .replace(/[\s.,;:\-*]+$/, "")
    .trim();
  if (s.includes("@")) {
    // UPI handle like rahul.k@okaxis → "Rahul K"; long machine handles stay as-is.
    const local = s.split("@")[0];
    const letters = local.replace(/[^a-z]/gi, "");
    if (letters.length >= 3 && local.length <= 20 && letters.length >= local.length * 0.6) {
      s = local
        .replace(/[._\-]+/g, " ")
        .replace(/\d+/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  if (s.length < 2) return null;
  if (!/[a-z]/i.test(s)) return null;
  if (/^\d[\d\s:.\-\/]*(am|pm)?$/i.test(s)) return null;
  if (/^\d{1,2}[:.]\d{2}/.test(s)) return null; // a time, e.g. "6:30 PM"
  if (BAD_START_RE.test(s)) return null;
  if (s.length > 60) s = s.slice(0, 60).trim();
  return titleCase(s);
}

export function extractMerchant(text: string): string | null {
  for (const re of MERCHANT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const cleaned = cleanMerchant(m[1] ?? "");
      if (cleaned) return cleaned;
    }
  }
  return null;
}

export function detectDirection(text: string): Direction {
  if (DEBIT_RE.test(text)) return "debit";
  if (CREDIT_RE.test(text)) return "credit";
  return "unknown";
}

export function parseSms(input: string): ParsedSms {
  const text = (input ?? "").replace(/\r\n?/g, "\n").trim();
  const direction = detectDirection(text);
  const base = { amount: null, currency: null, merchant: null, direction } as ParsedSms;

  if (!text) return { ...base, isTransaction: false, reason: "empty message" };
  if (OTP_RE.test(text) && !STRONG_DEBIT_RE.test(text)) {
    return { ...base, isTransaction: false, reason: "looks like an OTP" };
  }
  if (REMINDER_RE.test(text)) {
    return { ...base, isTransaction: false, reason: "looks like a reminder or request, not a payment" };
  }

  const amt = extractAmount(text);
  if (!amt) return { ...base, isTransaction: false, reason: "no amount found" };

  const merchant = extractMerchant(text);
  const result: ParsedSms = {
    isTransaction: direction !== "credit",
    amount: amt.amount,
    currency: amt.currency,
    merchant,
    direction,
  };
  if (direction === "credit") result.reason = "money received, not spent";
  return result;
}

/**
 * Split pasted text that may contain several messages.
 * Messages are separated by one or more blank lines.
 */
export function splitMessages(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface SmsDate {
  y: number;
  m: number; // 1-12
  d: number;
  hh: number | null;
  mm: number | null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?`;
const ISO_DATE_RE = /\b(20\d{2})-(\d{1,2})-(\d{1,2})(?:[ T:,]+(\d{1,2}):(\d{2})(?::\d{2})?)?/;
const MON_D_Y_RE = new RegExp(String.raw`\b${MON}\s+(\d{1,2}),?\s+(20\d{2})\b`, "i");
const D_MON_Y_RE = new RegExp(String.raw`\b(\d{1,2})[-\s]?${MON}(?:[-\s,]?(\d{4}|\d{2}))?(?![a-z0-9])`, "i");
const NUMERIC_RE = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/;
const TIME_RE = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/i;

const year = (s: string | undefined, fallback: number) => (!s ? fallback : s.length === 2 ? 2000 + Number(s) : Number(s));
const monthIndex = (s: string) => MONTHS.indexOf(s.toLowerCase().slice(0, 3)) + 1;

function timeAfter(text: string, from: number): { hh: number; mm: number } | null {
  const t = TIME_RE.exec(text.slice(from, from + 40));
  if (!t) return null;
  let hh = Number(t[1]);
  const mm = Number(t[2]);
  const ap = t[3]?.toLowerCase();
  if (ap === "pm" && hh < 12) hh += 12;
  if (ap === "am" && hh === 12) hh = 0;
  return hh < 24 && mm < 60 ? { hh, mm } : null;
}

/**
 * Finds the transaction date printed in a bank SMS, if any.
 * Numeric dates are read day-first (Indian banks) unless the amount is in USD.
 */
export function extractDate(text: string, currency: string | null, thisYear = new Date().getFullYear()): SmsDate | null {
  const ok = (y: number, m: number, d: number) => y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  const build = (y: number, m: number, d: number, at: number, own?: { hh: number; mm: number } | null): SmsDate | null => {
    if (!ok(y, m, d)) return null;
    const t = own ?? timeAfter(text, at);
    return { y, m, d, hh: t?.hh ?? null, mm: t?.mm ?? null };
  };

  let r = ISO_DATE_RE.exec(text);
  if (r) {
    const own = r[4] != null ? { hh: Number(r[4]), mm: Number(r[5]) } : null;
    const res = build(Number(r[1]), Number(r[2]), Number(r[3]), r.index + r[0].length, own);
    if (res) return res;
  }
  r = MON_D_Y_RE.exec(text);
  if (r) {
    const res = build(Number(r[3]), monthIndex(r[1]), Number(r[2]), r.index + r[0].length);
    if (res) return res;
  }
  r = D_MON_Y_RE.exec(text);
  if (r) {
    const res = build(year(r[3], thisYear), monthIndex(r[2]), Number(r[1]), r.index + r[0].length);
    if (res) return res;
  }
  r = NUMERIC_RE.exec(text);
  if (r) {
    const a = Number(r[1]);
    const b = Number(r[2]);
    const [d, m] = currency === "USD" ? [b, a] : [a, b];
    const res = build(year(r[3], thisYear), m, d, r.index + r[0].length);
    if (res) return res;
  }
  return null;
}

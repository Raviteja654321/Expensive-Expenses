const fmtCache = new Map<string, Intl.NumberFormat>();

export function money(amount: number | null | undefined, currency = "INR"): string {
  const n = amount ?? 0;
  const key = currency;
  let f = fmtCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    }
    fmtCache.set(key, f);
  }
  return f.format(n);
}

export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay(d, now)) return `Today, ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }) + `, ${time}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return "Today";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compact money for chart axes: ₹1.2K, ₹3L (INR) / $1.2K, $3M. */
export function moneyShort(n: number, currency = "INR"): string {
  const sym = currencySymbol(currency);
  const abs = Math.abs(n);
  if (currency === "INR") {
    if (abs >= 1e7) return `${sym}${+(n / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sym}${+(n / 1e5).toFixed(1)}L`;
  } else if (abs >= 1e6) return `${sym}${+(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sym}${+(n / 1e3).toFixed(1)}K`;
  return `${sym}${Math.round(n)}`;
}

export function pct(n: number): string {
  return `${Math.round(n)}%`;
}

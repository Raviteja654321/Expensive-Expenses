import type { Category, Transaction } from "../../../shared/types";
import { money, monthKey, round2 } from "./format";
import { byCategory, byMerchant, expenses, friendBalances, inMonth, monthBounds, monthToDate, previousMonthKey, spendOf, sum, totalOwed } from "./stats";

export type Tone = "warn" | "info" | "good";

export interface Insight {
  id: string;
  icon: string;
  title: string;
  body: string;
  tone: Tone;
  /** Where tapping the card should go. */
  link?: "friends" | "categories" | "merchants" | "trends";
}

const changePct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

/**
 * Plain-language suggestions about your spending, computed on the device.
 * `now` is injectable for tests.
 */
export function buildInsights(all: Transaction[], categories: Category[], currency: string, now = new Date()): Insight[] {
  const out: Insight[] = [];
  const list = expenses(all, currency);
  const key = monthKey(now);
  const prevKey = previousMonthKey(key);
  const day = now.getDate();
  const { days } = monthBounds(key);
  const month = list.filter((t) => inMonth(t, key));
  const total = sum(month);
  const prevTotal = sum(list.filter((t) => inMonth(t, prevKey)));
  const fmt = (n: number) => money(n, currency);

  // 1. Pace for the month
  if (day >= 3 && total > 0) {
    const projected = Math.round((total / day) * days);
    const ch = changePct(projected, prevTotal);
    if (ch != null && Math.abs(ch) >= 10) {
      out.push({
        id: "pace",
        icon: ch > 0 ? "📈" : "📉",
        title: `On pace for ${fmt(projected)} this month`,
        body: `That's ${Math.abs(Math.round(ch))}% ${ch > 0 ? "more" : "less"} than last month (${fmt(prevTotal)}).`,
        tone: ch > 0 ? "warn" : "good",
        link: "trends",
      });
    } else if (prevTotal === 0) {
      out.push({ id: "pace", icon: "🧮", title: `On pace for ${fmt(projected)} this month`, body: `Based on ${fmt(Math.round(total / day))} a day so far.`, tone: "info", link: "trends" });
    }
  }

  // 2. Budgets
  const elapsed = (day / days) * 100;
  const catTotals = new Map(byCategory(month, categories).map((c) => [c.id, c.total]));
  for (const c of categories) {
    if (!c.budget || c.budget <= 0) continue;
    const spent = catTotals.get(c.id) ?? 0;
    const used = (spent / c.budget) * 100;
    if (used >= 100) {
      out.push({
        id: `budget-${c.id}`,
        icon: "🚨",
        title: `${c.emoji} ${c.name} is over budget`,
        body: `${fmt(spent)} spent of ${fmt(c.budget)}, ${fmt(round2(spent - c.budget))} over.`,
        tone: "warn",
        link: "categories",
      });
    } else if (used >= 60 && used > elapsed + 15) {
      out.push({
        id: `budget-${c.id}`,
        icon: "⚠️",
        title: `${c.emoji} ${c.name}: ${Math.round(used)}% of budget used`,
        body: `${days - day} day${days - day === 1 ? "" : "s"} left this month, with ${fmt(round2(c.budget - spent))} remaining.`,
        tone: "warn",
        link: "categories",
      });
    }
  }

  // 3. Biggest category change vs the same point last month
  const prevMtdByCat = new Map(
    byCategory(list.filter((t) => inMonth(t, prevKey) && new Date(t.received_at).getDate() <= day), categories).map((c) => [c.id, c.total]),
  );
  let best: { name: string; now: number; before: number; ch: number } | null = null;
  for (const c of byCategory(month, categories)) {
    const before = prevMtdByCat.get(c.id) ?? 0;
    const ch = changePct(c.total, before);
    if (ch == null || before < 1) continue;
    if (!best || Math.abs(c.total - before) > Math.abs(best.now - best.before)) {
      best = { name: c.category ? `${c.category.emoji} ${c.category.name}` : "Uncategorized", now: c.total, before, ch };
    }
  }
  if (best && Math.abs(best.ch) >= 20) {
    out.push({
      id: "cat-change",
      icon: best.ch > 0 ? "🔺" : "🔻",
      title: `${best.name} is ${best.ch > 0 ? "up" : "down"} ${Math.abs(Math.round(best.ch))}%`,
      body: `${fmt(best.now)} so far vs ${fmt(best.before)} by this day last month.`,
      tone: best.ch > 0 ? "warn" : "good",
      link: "categories",
    });
  }

  // 4. Most frequent merchant
  const merchants = byMerchant(month).sort((a, b) => b.count - a.count);
  if (merchants[0] && merchants[0].count >= 3) {
    const m = merchants[0];
    out.push({
      id: "merchant",
      icon: "🔁",
      title: `${m.merchant}: ${m.count} times this month`,
      body: `${fmt(m.total)} in total, about ${fmt(Math.round(m.total / m.count))} each time.`,
      tone: "info",
      link: "merchants",
    });
  }

  // 5. Likely subscriptions: same merchant, similar amount, in 2+ of the last 3 months
  const last3 = [key, prevKey, previousMonthKey(prevKey)];
  const seen = new Map<string, { merchant: string; months: Set<string>; amounts: number[] }>();
  for (const t of list) {
    const k = monthKey(new Date(t.received_at));
    if (!last3.includes(k)) continue;
    const mk = t.merchant.toLowerCase();
    const cur = seen.get(mk) ?? { merchant: t.merchant, months: new Set(), amounts: [] };
    cur.months.add(k);
    cur.amounts.push(t.amount);
    seen.set(mk, cur);
  }
  const subs = [...seen.values()].filter((s) => {
    if (s.months.size < 2 || s.amounts.length > s.months.size + 1) return false;
    const min = Math.min(...s.amounts);
    const max = Math.max(...s.amounts);
    return max <= min * 1.1;
  });
  if (subs.length) {
    const monthly = round2(subs.reduce((s, x) => s + x.amounts[x.amounts.length - 1], 0));
    out.push({
      id: "subs",
      icon: "📺",
      title: `Looks like ${subs.length} subscription${subs.length > 1 ? "s" : ""}`,
      body: `${subs.slice(0, 4).map((s) => `${s.merchant} (${fmt(s.amounts[s.amounts.length - 1])})`).join(", ")}, about ${fmt(monthly)} a month. Still using them all?`,
      tone: "info",
      link: "merchants",
    });
  }

  // 6. Friends owe you
  const mine = all.filter((t) => t.currency === currency);
  const friends = friendBalances(mine);
  const owed = totalOwed(mine);
  if (owed > 0) {
    out.push({
      id: "owed",
      icon: "🤝",
      title: `Friends owe you ${fmt(owed)}`,
      body: friends.slice(0, 3).map((f) => `${f.name} ${fmt(f.owed)}`).join(" · ") + (friends.length > 3 ? " · …" : ""),
      tone: "info",
      link: "friends",
    });
  }

  // 7. Weekend share
  if (month.length >= 6 && total > 0) {
    const weekend = sum(month.filter((t) => [0, 6].includes(new Date(t.received_at).getDay())));
    const share = (weekend / total) * 100;
    if (share >= 40) {
      out.push({ id: "weekend", icon: "🎉", title: `${Math.round(share)}% of your spending is on weekends`, body: `${fmt(weekend)} on Saturdays and Sundays this month.`, tone: "info", link: "trends" });
    }
  }

  // 8. Small purchases add up
  const small = currency === "INR" ? 200 : 10;
  const smalls = month.filter((t) => spendOf(t) < small);
  if (smalls.length >= 6) {
    out.push({
      id: "small",
      icon: "🪙",
      title: `${smalls.length} small purchases added up to ${fmt(sum(smalls))}`,
      body: `Each under ${fmt(small)}. Small things add up quickly.`,
      tone: "info",
    });
  }

  // 9. Biggest expense
  const biggest = [...month].sort((a, b) => spendOf(b) - spendOf(a))[0];
  if (biggest && month.length >= 3) {
    out.push({
      id: "biggest",
      icon: "💸",
      title: `Biggest expense: ${biggest.merchant}`,
      body: `${fmt(spendOf(biggest))} on ${new Date(biggest.received_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`,
      tone: "info",
    });
  }

  // 10. No-spend days
  if (day >= 5 && month.length > 0) {
    const spentDays = new Set(month.map((t) => new Date(t.received_at).getDate()));
    const free = Array.from({ length: day }, (_, i) => i + 1).filter((d) => !spentDays.has(d)).length;
    if (free >= 3) {
      out.push({ id: "nospend", icon: "🎯", title: `${free} no-spend days so far`, body: `Out of ${day} days this month. Nice!`, tone: "good", link: "trends" });
    }
  }

  // 11. Month-to-date vs last month, when the pace card didn't fire
  if (!out.some((i) => i.id === "pace") && prevTotal > 0 && day >= 3) {
    const prevMtd = monthToDate(list, prevKey, day);
    const ch = changePct(total, prevMtd);
    if (ch != null) {
      out.push({
        id: "mtd",
        icon: "🗓️",
        title: `${Math.abs(Math.round(ch))}% ${ch >= 0 ? "more" : "less"} than this time last month`,
        body: `${fmt(total)} so far vs ${fmt(prevMtd)} by day ${day} last month.`,
        tone: ch > 10 ? "warn" : ch < -10 ? "good" : "info",
        link: "trends",
      });
    }
  }

  const order: Record<Tone, number> = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

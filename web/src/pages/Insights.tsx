import { useMemo, useState } from "react";
import type { Transaction } from "../../../shared/types";
import { useStore } from "../store";
import { money, moneyShort, monthKey, monthLabel, round2 } from "../lib/format";
import { buildInsights, type Insight } from "../lib/insights";
import {
  byCategory, byMerchant, dailyTotals, expenses, friendBalances, inMonth, monthBounds, monthTotals, previousMonthKey, sum,
  totalOwed, weekdayAverages, type CatTotal,
} from "../lib/stats";
import { settleFriend } from "../lib/actions";
import { ColumnChart } from "../components/charts/ColumnChart";
import { HBars } from "../components/charts/HBars";
import { Heatmap } from "../components/charts/Heatmap";
import { Meter } from "../components/charts/Meter";
import { InsightCard } from "../components/InsightCard";
import { Modal } from "../components/Modal";
import { MonthSwitch } from "../components/MonthSwitch";
import { TxnList } from "../components/TxnList";

export type InsightView = "trends" | "categories" | "calendar" | "merchants" | "friends" | "tips";
const VIEWS: { key: InsightView; label: string }[] = [
  { key: "trends", label: "📈 Trends" },
  { key: "categories", label: "🏷️ Categories" },
  { key: "calendar", label: "🗓️ Calendar" },
  { key: "merchants", label: "🏪 Merchants" },
  { key: "friends", label: "🤝 Friends" },
  { key: "tips", label: "💡 Tips" },
];

const shortMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
};

export function Insights({ view, setView }: { view: InsightView; setView: (v: InsightView) => void }) {
  const { data, currency } = useStore();
  const [month, setMonth] = useState(monthKey());
  const list = useMemo(() => expenses(data.transactions, currency), [data.transactions, currency]);
  const monthList = useMemo(() => list.filter((t) => inMonth(t, month)).sort((a, b) => b.received_at.localeCompare(a.received_at)), [list, month]);
  const fmt = (n: number) => money(n, currency);

  return (
    <>
      <div className="view-tabs" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>
      {view !== "friends" && view !== "tips" && (
        <div className="filter-row">
          <MonthSwitch value={month} onChange={setMonth} />
          <span className="small muted tnum">{fmt(sum(monthList))} · {monthList.length} expenses</span>
        </div>
      )}

      {view === "trends" && <Trends list={list} month={month} monthList={monthList} fmt={fmt} currency={currency} />}
      {view === "categories" && <CategoriesView list={list} month={month} monthList={monthList} fmt={fmt} currency={currency} />}
      {view === "calendar" && <CalendarView month={month} monthList={monthList} fmt={fmt} />}
      {view === "merchants" && <MerchantsView monthList={monthList} fmt={fmt} />}
      {view === "friends" && <FriendsView fmt={fmt} />}
      {view === "tips" && <TipsView onOpen={(l) => setView(l === "trends" ? "trends" : l)} />}
      {view !== "friends" && view !== "tips" && list.length === 0 && (
        <div className="card empty">
          <div className="big">📊</div>
          <p>Charts appear here once you've reviewed a few expenses.</p>
        </div>
      )}
    </>
  );
}

// ---------------- Trends ----------------
function Trends({ list, month, monthList, fmt, currency }: { list: Transaction[]; month: string; monthList: Transaction[]; fmt: (n: number) => string; currency: string }) {
  const [y, m] = month.split("-").map(Number);
  const daily = dailyTotals(list, month);
  const isNow = month === monthKey();
  const elapsed = isNow ? new Date().getDate() : monthBounds(month).days;
  const total = sum(monthList);
  const avg = Math.round(total / elapsed);
  const biggestDay = daily.reduce((best, v, i) => (v > daily[best] ? i : best), 0);
  const noSpend = daily.slice(0, elapsed).filter((v) => v === 0).length;
  const months = monthTotals(list, month, 6);
  const weekday = weekdayAverages(list, isNow ? new Date() : new Date(y, m, 0, 23, 59));
  const avgMonth = Math.round(months.reduce((a, b) => a + b.total, 0) / Math.max(1, months.filter((x) => x.total > 0).length));

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi"><span>Total</span><strong>{fmt(total)}</strong></div>
        <div className="kpi"><span>Daily average</span><strong>{fmt(avg)}</strong></div>
        <div className="kpi"><span>Biggest day</span><strong>{daily[biggestDay] ? fmt(daily[biggestDay]) : "—"}</strong><small>{daily[biggestDay] ? `${biggestDay + 1} ${shortMonth(month)}` : ""}</small></div>
        <div className="kpi"><span>No-spend days</span><strong>{noSpend}</strong><small>of {elapsed}</small></div>
      </div>

      <div className="card">
        <h2>Daily spending</h2>
        <ColumnChart
          ariaLabel={`Daily spending in ${monthLabel(month)}`}
          data={daily.map((v, i) => ({
            key: String(i),
            label: i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : "",
            title: new Date(y, m - 1, i + 1).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
            value: v,
          }))}
          reference={avg}
          referenceLabel={`avg ${moneyShort(avg, currency)}`}
          format={fmt}
          formatAxis={(n) => moneyShort(n, currency)}
        />
        <details className="table-view">
          <summary className="small muted">View as table</summary>
          <table>
            <tbody>
              {daily.map((v, i) => (v > 0 ? (
                <tr key={i}><td>{new Date(y, m - 1, i + 1).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</td><td className="tnum">{fmt(v)}</td></tr>
              ) : null))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="card">
        <h2>Last 6 months</h2>
        <ColumnChart
          ariaLabel="Monthly totals for the last 6 months"
          emphasisMode
          data={months.map((x) => ({ key: x.key, label: shortMonth(x.key), title: monthLabel(x.key), value: x.total, emphasis: x.key === month }))}
          reference={avgMonth}
          referenceLabel={`avg ${moneyShort(avgMonth, currency)}`}
          format={fmt}
          formatAxis={(n) => moneyShort(n, currency)}
        />
      </div>

      <div className="card">
        <h2>Average by weekday</h2>
        <p className="small muted card-sub">Last 12 weeks</p>
        <ColumnChart
          ariaLabel="Average spending per weekday"
          data={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => ({ key: d, label: d, title: `${d} (average)`, value: weekday[i] }))}
          format={fmt}
          formatAxis={(n) => moneyShort(n, currency)}
          height={140}
        />
      </div>
    </>
  );
}

// ---------------- Categories ----------------
function CategoriesView({ list, month, monthList, fmt, currency }: { list: Transaction[]; month: string; monthList: Transaction[]; fmt: (n: number) => string; currency: string }) {
  const { categories } = useStore();
  const [open, setOpen] = useState<CatTotal | null>(null);
  const cats = byCategory(monthList, categories);
  const prev = new Map(byCategory(list.filter((t) => inMonth(t, previousMonthKey(month))), categories).map((c) => [c.id, c.total]));
  const total = sum(monthList);
  const isNow = month === monthKey();
  const pace = isNow ? new Date().getDate() / monthBounds(month).days : 1;
  const unused = categories.filter((c) => !cats.some((x) => x.id === c.id));

  return (
    <>
      {cats.length > 0 && (
        <div className="card">
          <h2>Your share by category</h2>
          <HBars
            rows={cats.map((c) => {
              const before = prev.get(c.id) ?? 0;
              const ch = before > 0 ? Math.round(((c.total - before) / before) * 100) : null;
              const budget = c.category?.budget ?? null;
              return {
                key: c.id,
                swatch: `var(--c-${c.category?.color ?? "gray"})`,
                label: c.category ? `${c.category.emoji} ${c.category.name}` : "🏷️ Uncategorized",
                value: c.total,
                valueText: `${fmt(c.total)} · ${total ? Math.round((c.total / total) * 100) : 0}%`,
                sub: (
                  <>
                    <span>{c.count} expense{c.count === 1 ? "" : "s"}</span>
                    {ch != null && <span className={`delta-text ${ch > 0 ? "up" : "down"}`}>{ch > 0 ? "▲" : "▼"} {Math.abs(ch)}% vs {shortMonth(previousMonthKey(month))}</span>}
                    {budget ? <span>Budget {fmt(budget)}</span> : null}
                    {budget ? <Meter value={c.total} max={budget} pace={pace} /> : null}
                  </>
                ),
                onClick: () => setOpen(c),
              };
            })}
          />
        </div>
      )}
      {unused.length > 0 && cats.length > 0 && (
        <p className="small muted center">Nothing spent on: {unused.map((c) => `${c.emoji} ${c.name}`).join(", ")}</p>
      )}
      {open && (
        <Modal title={open.category ? `${open.category.emoji} ${open.category.name}` : "Uncategorized"} onClose={() => setOpen(null)}>
          <CategoryDetail cat={open} list={list} month={month} fmt={fmt} currency={currency} />
        </Modal>
      )}
    </>
  );
}

function CategoryDetail({ cat, list, month, fmt, currency }: { cat: CatTotal; list: Transaction[]; month: string; fmt: (n: number) => string; currency: string }) {
  const mine = list.filter((t) => (cat.id === "none" ? !t.category_id : t.category_id === cat.id));
  const months = monthTotals(mine, month, 6);
  const monthItems = mine.filter((t) => inMonth(t, month)).sort((a, b) => b.received_at.localeCompare(a.received_at));
  const merchants = byMerchant(monthItems).slice(0, 5);
  return (
    <div className="stack">
      <div className="kpi-row">
        <div className="kpi"><span>{monthLabel(month)}</span><strong>{fmt(cat.total)}</strong></div>
        <div className="kpi"><span>Average per expense</span><strong>{fmt(Math.round(cat.total / Math.max(1, cat.count)))}</strong></div>
      </div>
      <div className="card">
        <h2>Last 6 months</h2>
        <ColumnChart
          ariaLabel="Monthly totals for this category"
          emphasisMode
          data={months.map((x) => ({ key: x.key, label: shortMonth(x.key), title: monthLabel(x.key), value: x.total, emphasis: x.key === month }))}
          format={fmt}
          formatAxis={(n) => moneyShort(n, currency)}
          height={140}
        />
      </div>
      {merchants.length > 0 && (
        <div className="card">
          <h2>Top merchants</h2>
          <HBars rows={merchants.map((x) => ({ key: x.merchant, label: x.merchant, value: x.total, valueText: fmt(x.total), sub: `${x.count}×` }))} />
        </div>
      )}
      <TxnList items={monthItems} />
    </div>
  );
}

// ---------------- Calendar ----------------
function CalendarView({ month, monthList, fmt }: { month: string; monthList: Transaction[]; fmt: (n: number) => string }) {
  const [day, setDay] = useState<number | null>(null);
  const [y, m] = month.split("-").map(Number);
  const daily = dailyTotals(monthList, month);
  const items = day ? monthList.filter((t) => new Date(t.received_at).getDate() === day) : [];
  return (
    <>
      <div className="card">
        <h2>Spending calendar</h2>
        <Heatmap key={month} year={y} month={m} values={daily} format={fmt} selected={day} onSelect={setDay} />
      </div>
      {day && <TxnList items={items} empty={<p className="center small muted">Nothing spent on this day 🎯</p>} />}
    </>
  );
}

// ---------------- Merchants ----------------
function MerchantsView({ monthList, fmt }: { monthList: Transaction[]; fmt: (n: number) => string }) {
  const [open, setOpen] = useState<string | null>(null);
  const merchants = byMerchant(monthList).slice(0, 15);
  if (!merchants.length) return null;
  return (
    <>
      <div className="card">
        <h2>Top merchants</h2>
        <HBars
          rows={merchants.map((x) => ({
            key: x.merchant,
            label: x.merchant,
            value: x.total,
            valueText: fmt(x.total),
            sub: `${x.count} time${x.count === 1 ? "" : "s"} · avg ${fmt(Math.round(x.total / x.count))}`,
            onClick: () => setOpen(x.merchant),
          }))}
        />
      </div>
      {open && (
        <Modal title={open} onClose={() => setOpen(null)}>
          <TxnList items={monthList.filter((t) => t.merchant.toLowerCase() === open.toLowerCase())} />
        </Modal>
      )}
    </>
  );
}

// ---------------- Friends ----------------
function FriendsView({ fmt }: { fmt: (n: number) => string }) {
  const { data, currency, apply, toast } = useStore();
  const friends = friendBalances(data.transactions.filter((t) => t.currency === currency));
  const total = totalOwed(data.transactions.filter((t) => t.currency === currency));
  const settledCount = data.transactions.filter((t) => t.kind === "split" && t.settled).length;

  async function remind(name: string, owed: number, splits: Transaction[]) {
    const lines = splits.slice(0, 8).map((t) => `• ${t.merchant} (${new Date(t.received_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })})`);
    const text = `Hey ${name}! Quick reminder: you owe me ${fmt(owed)} for:\n${lines.join("\n")}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Reminder copied. Paste it in a chat.");
      }
    } catch {
      /* dismissed */
    }
  }

  return (
    <>
      <div className="card hero-mini">
        <span>Friends owe you</span>
        <strong>{fmt(total)}</strong>
        <small>{friends.length ? `${friends.length} friend${friends.length > 1 ? "s" : ""}` : "All settled up 🎉"}{settledCount ? ` · ${settledCount} split${settledCount > 1 ? "s" : ""} settled` : ""}</small>
      </div>
      {friends.map((f) => (
        <div className="card friend" key={f.name}>
          <div className="spread">
            <div className="row">
              <span className="avatar-letter" aria-hidden>{f.name.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{f.name}</strong>
                <div className="small muted">{f.splits.length} split{f.splits.length > 1 ? "s" : ""}</div>
              </div>
            </div>
            <strong className="owed tnum">{fmt(f.owed)}</strong>
          </div>
          <ul className="small muted friend-splits">
            {f.splits.slice(0, 4).map((t) => (
              <li key={t.id}>{t.merchant} · {fmt(t.amount)} · {new Date(t.received_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</li>
            ))}
            {f.splits.length > 4 && <li>…and {f.splits.length - 4} more</li>}
          </ul>
          <div className="row">
            <button className="btn sm" onClick={() => void remind(f.name, f.owed, f.splits)}>📤 Send reminder</button>
            <button
              className="btn sm primary"
              onClick={() => {
                apply((d) => settleFriend(d, f.name));
                toast(`Settled up with ${f.name}`);
              }}
            >
              ✓ Mark settled
            </button>
          </div>
        </div>
      ))}
      {!friends.length && (
        <p className="center small muted">When you split an expense in a pop-up and add friends' names, what they owe you shows up here.</p>
      )}
    </>
  );
}

// ---------------- Tips ----------------
function TipsView({ onOpen }: { onOpen: (l: NonNullable<Insight["link"]>) => void }) {
  const { data, categories, currency } = useStore();
  const insights = buildInsights(data.transactions, categories, currency);
  return (
    <>
      {insights.map((i) => (
        <InsightCard key={i.id} insight={i} onOpen={onOpen} />
      ))}
      {!insights.length && (
        <div className="card empty">
          <div className="big">💡</div>
          <p>Suggestions appear as your expenses build up: budget alerts, subscriptions, spending pace and more.</p>
        </div>
      )}
      <p className="small muted center">Tip: set a monthly budget per category in the Categories tab to get alerts here.</p>
    </>
  );
}

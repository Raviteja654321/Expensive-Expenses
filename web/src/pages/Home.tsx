import { useMemo, useState } from "react";
import { useStore } from "../store";
import { money, monthKey, monthLabel, round2 } from "../lib/format";
import { buildInsights, type Insight } from "../lib/insights";
import { byCategory, expenses, inMonth, monthBounds, monthToDate, previousMonthKey, sum, totalOwed } from "../lib/stats";
import { sampleInbox } from "../lib/samples";
import { splitInbox } from "../lib/actions";
import { DonutChart } from "../components/charts/DonutChart";
import type { ColorKey } from "../../../shared/types";
import { Meter } from "../components/charts/Meter";
import { InsightCard } from "../components/InsightCard";
import { TxnList } from "../components/TxnList";
import type { Nav } from "../App";


export function Home({ onReview, nav }: { onReview: () => void; nav: Nav }) {
  const { data, categories, currency, pending, ingest, toast } = useStore();
  const [active, setActive] = useState<string | null>(null);
  const now = new Date();
  const key = monthKey(now);
  const day = now.getDate();

  const s = useMemo(() => {
    const list = expenses(data.transactions, currency);
    const month = list.filter((t) => inMonth(t, key));
    const total = sum(month);
    const prevMtd = monthToDate(list, previousMonthKey(key), day);
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - 6);
    const today = sum(list.filter((t) => new Date(t.received_at) >= startToday));
    const week = sum(list.filter((t) => new Date(t.received_at) >= startWeek));
    const cats = byCategory(month, categories);
    const top = cats.slice(0, 6);
    const rest = round2(cats.slice(6).reduce((a, c) => a + c.total, 0));
    const parts: { key: string; label: string; value: number; color: ColorKey }[] = top.map((c) => ({
      key: c.id,
      label: c.category ? `${c.category.emoji} ${c.category.name}` : "🏷️ Uncategorized",
      value: c.total,
      color: c.category?.color ?? "gray",
    }));
    if (rest > 0) parts.push({ key: "rest", label: "Everything else", value: rest, color: "gray" });
    const budget = categories.reduce((a, c) => a + (c.budget ?? 0), 0);
    const owed = totalOwed(data.transactions.filter((t) => t.currency === currency));
    const recent = [...list].sort((a, b) => b.received_at.localeCompare(a.received_at)).slice(0, 5);
    return { total, prevMtd, today, week, cats, top, rest, parts, budget, owed, recent, count: month.length };
  }, [data.transactions, categories, currency, key, day]);

  const insights = useMemo(() => buildInsights(data.transactions, categories, currency, now).slice(0, 3), [data.transactions, categories, currency]);
  const delta = s.prevMtd > 0 ? Math.round(((s.total - s.prevMtd) / s.prevMtd) * 100) : null;
  const { days } = monthBounds(key);
  const isNew = data.transactions.length === 0;

  function trySamples() {
    const r = ingest(splitInbox(sampleInbox(currency)), "sample");
    const n = r.filter((x) => x.status === "queued").length;
    toast(n ? `Added ${n} sample transactions` : "Samples already added");
    if (n) onReview();
  }

  const openInsight = (link: NonNullable<Insight["link"]>) => nav("insights", link === "trends" ? "trends" : link);

  return (
    <>
      <section className="hero">
        <div className="hero-label">Spent in {monthLabel(key)}</div>
        <div className="hero-value">{money(s.total, currency)}</div>
        <div className="hero-delta">
          {delta == null ? (
            <span>{s.count} expense{s.count === 1 ? "" : "s"} this month</span>
          ) : (
            <span className={`delta ${delta > 0 ? "up" : "down"}`}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}% vs this point last month
            </span>
          )}
        </div>
        {s.budget > 0 && (
          <div className="hero-budget">
            <div className="spread small">
              <span>Monthly budget {money(s.budget, currency)}</span>
              <span>{money(Math.max(0, round2(s.budget - s.total)), currency)} left</span>
            </div>
            <Meter value={s.total} max={s.budget} pace={day / days} />
          </div>
        )}
        <div className="hero-stats">
          <div><span>Today</span><strong>{money(s.today, currency)}</strong></div>
          <div><span>Last 7 days</span><strong>{money(s.week, currency)}</strong></div>
          <div><span>Daily average</span><strong>{money(Math.round(s.total / day), currency)}</strong></div>
        </div>
      </section>

      {pending.length > 0 && (
        <button className="review-banner" onClick={onReview}>
          <span className="big" aria-hidden>📬</span>
          <span className="grow">
            <strong>{pending.length} new transaction{pending.length > 1 ? "s" : ""} to review</strong>
            <small>Tap to categorize or split them</small>
          </span>
          <span aria-hidden>›</span>
        </button>
      )}

      {isNew && (
        <div className="card welcome">
          <h2>Let's get your expenses in</h2>
          <p className="muted small">Connect your iPhone once, and every bank SMS shows up here, ready to sort. Or try it with sample messages first.</p>
          <div className="row wrap">
            <button className="btn primary" onClick={() => nav("settings")}>📱 Set up my iPhone</button>
            <button className="btn" onClick={trySamples}>✨ Try sample messages</button>
          </div>
        </div>
      )}

      {s.owed > 0 && (
        <div className="kpi-row">
          <button className="kpi" onClick={() => nav("insights", "friends")}>
            <span>Friends owe you</span>
            <strong>{money(s.owed, currency)}</strong>
          </button>
          <button className="kpi" onClick={() => nav("insights", "categories")}>
            <span>Top category</span>
            <strong>{s.top[0]?.category ? `${s.top[0].category.emoji} ${s.top[0].category.name}` : "—"}</strong>
          </button>
        </div>
      )}

      {s.parts.length > 0 && (
        <div className="card">
          <div className="spread">
            <h2>Where it went</h2>
            <button className="linkbtn small" onClick={() => nav("insights", "breakdown")}>Breakdown ›</button>
          </div>
          <div className="home-donut">
            <DonutChart
              size={184}
              ariaLabel="Spending by category this month"
              slices={s.parts.map((p) => ({ key: p.key, label: p.label, value: p.value, color: `var(--c-${p.color})` }))}
              format={(n) => money(n, currency)}
              centerTitle="This month"
              active={active}
              onActive={setActive}
            />
            <ul className="legend-list compact">
              {s.parts.map((p) => (
                <li key={p.key}>
                  <button className={`legend-row${active === p.key ? " on" : ""}`} onClick={() => setActive(active === p.key ? null : p.key)}>
                    <span className="swatch" style={{ background: `var(--c-${p.color})` }} aria-hidden />
                    <span className="grow">{p.label}</span>
                    <span className="tnum muted pct">{s.total ? Math.round((p.value / s.total) * 100) : 0}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="section">
          <div className="spread section-head">
            <h2>Suggestions</h2>
            <button className="linkbtn small" onClick={() => nav("insights", "tips")}>See all ›</button>
          </div>
          {insights.map((i) => (
            <InsightCard key={i.id} insight={i} onOpen={openInsight} />
          ))}
        </div>
      )}

      {s.recent.length > 0 && (
        <div className="section">
          <div className="spread section-head">
            <h2>Recent</h2>
            <button className="linkbtn small" onClick={() => nav("activity")}>See all ›</button>
          </div>
          <TxnList items={s.recent} />
        </div>
      )}
      {!isNew && s.recent.length === 0 && pending.length === 0 && (
        <div className="card empty">
          <div className="big">🧾</div>
          <p>No expenses yet this month.</p>
        </div>
      )}
      <p className="center small muted footnote">🔒 Your data is stored only on this device.</p>
    </>
  );
}


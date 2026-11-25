import { useMemo, useState } from "react";
import { useStore } from "../store";
import { money, monthKey } from "../lib/format";
import { inMonth, spendOf } from "../lib/stats";
import { reopenTxn } from "../lib/actions";
import { MonthSwitch } from "../components/MonthSwitch";
import { TxnList } from "../components/TxnList";

type Filter = "all" | "personal" | "split" | "ignored";

export function Activity({ onReview }: { onReview: () => void }) {
  const { data, categories, pending, apply, toast } = useStore();
  const [month, setMonth] = useState(monthKey());
  const [allTime, setAllTime] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [cat, setCat] = useState<string>("");

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const catNames = new Map(categories.map((c) => [c.id, c.name.toLowerCase()]));
    return data.transactions
      .filter((t) => (filter === "ignored" ? t.status === "ignored" : t.status === "done"))
      .filter((t) => filter === "all" || filter === "ignored" || t.kind === filter)
      .filter((t) => !cat || (cat === "none" ? !t.category_id : t.category_id === cat))
      .filter((t) => allTime || inMonth(t, month))
      .filter(
        (t) =>
          !query ||
          t.merchant.toLowerCase().includes(query) ||
          (t.note ?? "").toLowerCase().includes(query) ||
          (t.split_with ?? "").toLowerCase().includes(query) ||
          (t.category_id ? (catNames.get(t.category_id) ?? "") : "uncategorized").includes(query),
      )
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  }, [data.transactions, categories, q, filter, cat, month, allTime]);

  const total = items.reduce((s, t) => s + spendOf(t), 0);
  const currency = items[0]?.currency ?? data.profile?.currency ?? "INR";

  return (
    <>
      {pending.length > 0 && (
        <button className="review-banner" onClick={onReview}>
          <span className="big" aria-hidden>📬</span>
          <span className="grow"><strong>{pending.length} waiting for review</strong><small>Tap to go through them</small></span>
          <span aria-hidden>›</span>
        </button>
      )}
      <div className="search">
        <span aria-hidden>🔎</span>
        <input className="input" type="search" placeholder="Search merchant, category, friend, note" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search expenses" />
      </div>
      <div className="filter-row wrap">
        {!allTime && <MonthSwitch value={month} onChange={setMonth} />}
        <button className={`chip sm${allTime ? "" : ""}`} aria-pressed={allTime} onClick={() => setAllTime((v) => !v)}>All time</button>
      </div>
      <div className="chips scroll" role="group" aria-label="Filter">
        {(["all", "personal", "split", "ignored"] as Filter[]).map((f) => (
          <button key={f} className="chip sm" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "personal" ? "🙋 Just me" : f === "split" ? "👥 Split" : "🚫 Ignored"}
          </button>
        ))}
        <select className="chip sm select-chip" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
          <option value="none">Uncategorized</option>
        </select>
      </div>
      {filter !== "ignored" && items.length > 0 && (
        <p className="small muted tnum" style={{ margin: "4px 2px 0" }}>
          {items.length} expense{items.length === 1 ? "" : "s"} · your share {money(total, currency)}
        </p>
      )}
      {filter === "ignored" ? (
        <div className="txn-list" style={{ marginTop: 12 }}>
          {items.map((t) => (
            <div key={t.id} className="txn-row">
              <span className="avatar" aria-hidden>🚫</span>
              <span className="grow">
                <div className="title">{t.merchant} · {money(t.amount, t.currency)}</div>
                <div className="sub">{new Date(t.received_at).toLocaleDateString()}</div>
              </span>
              <button className="btn sm" onClick={() => { apply((d) => reopenTxn(d, t.id)); toast("Moved back to review"); }}>Review again</button>
            </div>
          ))}
          {!items.length && <p className="center small muted" style={{ padding: 16 }}>Nothing ignored.</p>}
        </div>
      ) : (
        <TxnList items={items} empty={<div className="card empty" style={{ marginTop: 12 }}><div className="big">🔍</div><p>No expenses match.</p></div>} />
      )}
    </>
  );
}

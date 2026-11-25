import { useCallback, useEffect, useMemo, useState } from "react";
import type { Transaction } from "../../../shared/types";
import { api } from "../api";
import { useApp } from "../context";
import { dayLabel, money, monthKey, monthLabel, round2, shiftMonth } from "../format";
import { Modal } from "./Modal";
import { ReviewForm } from "./ReviewForm";

function monthRange(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
}

export function Dashboard({
  pendingCount,
  onReview,
  refreshKey,
  onChanged,
}: {
  pendingCount: number;
  onReview: () => void;
  refreshKey: number;
  onChanged: () => void;
}) {
  const { categories, settings } = useApp();
  const [month, setMonth] = useState(monthKey());
  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [ignored, setIgnored] = useState<Transaction[] | null>(null);

  const load = useCallback(async () => {
    const { from, to } = monthRange(month);
    try {
      setTxns(await api<Transaction[]>(`/transactions?status=done&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const mainCur = settings?.currency ?? "INR";
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const stats = useMemo(() => {
    const list = txns ?? [];
    const main = list.filter((t) => t.currency === mainCur);
    const others = new Map<string, number>();
    for (const t of list) if (t.currency !== mainCur) others.set(t.currency, (others.get(t.currency) ?? 0) + (t.my_share ?? t.amount));
    const total = round2(main.reduce((s, t) => s + (t.my_share ?? t.amount), 0));
    const owed = round2(main.filter((t) => t.kind === "split").reduce((s, t) => s + (t.amount - (t.my_share ?? 0)), 0));
    const byCat = new Map<string, number>();
    for (const t of main) {
      const k = t.category_id && catById.has(t.category_id) ? t.category_id : "none";
      byCat.set(k, (byCat.get(k) ?? 0) + (t.my_share ?? t.amount));
    }
    const rows = [...byCat.entries()]
      .map(([id, v]) => ({ id, value: round2(v), cat: catById.get(id) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    return { total, owed, rows, others, count: list.length };
  }, [txns, mainCur, catById]);

  const groups = useMemo(() => {
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of txns ?? []) {
      const day = new Date(t.received_at).toDateString();
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(t);
      else out.push({ day, items: [t] });
    }
    return out;
  }, [txns]);

  async function loadIgnored() {
    try {
      setIgnored(await api<Transaction[]>("/transactions?status=ignored"));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function restore(t: Transaction) {
    await api(`/transactions/${t.id}/reopen`, { method: "POST" });
    setIgnored((list) => (list ?? []).filter((x) => x.id !== t.id));
    onChanged();
  }

  const max = stats.rows[0]?.value ?? 0;
  const isCurrentMonth = month === monthKey();

  return (
    <>
      {pendingCount > 0 && (
        <button className="review-banner" onClick={onReview}>
          <span className="big" aria-hidden>📬</span>
          <span className="grow">
            <strong>
              {pendingCount} new transaction{pendingCount > 1 ? "s" : ""} to review
            </strong>
            <small>Tap to categorize or split them</small>
          </span>
          <span aria-hidden>›</span>
        </button>
      )}

      <div className="card hero-stat">
        <div className="spread">
          <span className="label">You spent</span>
          <div className="month-switch">
            <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
            <span>{monthLabel(month)}</span>
            <button onClick={() => setMonth(shiftMonth(month, 1))} disabled={isCurrentMonth} aria-label="Next month" style={{ opacity: isCurrentMonth ? 0.35 : 1 }}>›</button>
          </div>
        </div>
        <div className="value tnum">{txns ? money(stats.total, mainCur) : "…"}</div>
        <div className="small muted tnum">
          {stats.count} expense{stats.count === 1 ? "" : "s"}
          {stats.owed > 0 && <> · Friends owe you <strong style={{ color: "var(--text)" }}>{money(stats.owed, mainCur)}</strong></>}
          {[...stats.others.entries()].map(([c, v]) => (
            <span key={c}> · plus {money(v, c)}</span>
          ))}
        </div>
      </div>

      {error && <div className="error" style={{ marginBottom: 14 }}>{error}</div>}

      {stats.rows.length > 0 && (
        <div className="card">
          <h2>Your share by category</h2>
          <ul className="cat-bars">
            {stats.rows.map((r) => {
              const pct = stats.total ? Math.round((r.value / stats.total) * 100) : 0;
              const label = r.cat ? `${r.cat.emoji} ${r.cat.name}` : "🏷️ Uncategorized";
              return (
                <li key={r.id} title={`${label}: ${money(r.value, mainCur)} (${pct}%)`}>
                  <div className="top">
                    <span className="name">{label}</span>
                    <span className="tnum">
                      <span className="val">{money(r.value, mainCur)}</span>
                      <span className="pct">{pct}%</span>
                    </span>
                  </div>
                  <div className="bar-track" aria-hidden>
                    <div className="bar-fill" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {txns && txns.length === 0 && pendingCount === 0 && (
        <div className="card empty">
          <div className="big">🧾</div>
          <p style={{ margin: 0 }}>No expenses in {monthLabel(month)} yet.</p>
          {isCurrentMonth && <p className="small">Set up your iPhone in Settings so bank SMS show up here automatically, or paste a message there to try it.</p>}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.day}>
          <div className="day-head">{dayLabel(g.items[0].received_at)}</div>
          <div className="txn-list">
            {g.items.map((t) => {
              const c = t.category_id ? catById.get(t.category_id) : undefined;
              return (
                <button key={t.id} className="txn-row" onClick={() => setEditing(t)}>
                  <span className="avatar" aria-hidden>{c?.emoji ?? "🧾"}</span>
                  <span className="grow">
                    <div className="title">{t.merchant}</div>
                    <div className="sub">
                      {c?.name ?? "Uncategorized"}
                      {t.kind === "split" && <span className="pill">Split{t.split_with ? ` · ${t.split_with}` : ""}</span>}
                      {t.splitwise_expense_id && <span className="pill">Splitwise</span>}
                    </div>
                  </span>
                  <span className="amt tnum">
                    {money(t.my_share ?? t.amount, t.currency)}
                    {t.kind === "split" && <small>of {money(t.amount, t.currency)}</small>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div className="center" style={{ marginTop: 18 }}>
        {ignored === null ? (
          <button className="linkbtn small" onClick={() => void loadIgnored()}>Show ignored messages</button>
        ) : (
          <div className="card" style={{ textAlign: "left" }}>
            <div className="spread">
              <h2 style={{ margin: 0 }}>Ignored ({ignored.length})</h2>
              <button className="linkbtn small" onClick={() => setIgnored(null)}>Hide</button>
            </div>
            {ignored.length === 0 && <p className="muted small">Nothing ignored.</p>}
            {ignored.map((t) => (
              <div key={t.id} className="cat-row">
                <span className="grow">
                  <div style={{ fontWeight: 600 }}>{t.merchant} · {money(t.amount, t.currency)}</div>
                  <div className="small muted">{dayLabel(t.received_at)}</div>
                </span>
                <button className="btn sm" onClick={() => void restore(t)}>Review again</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <Modal title="Edit expense" onClose={() => setEditing(null)}>
          <ReviewForm
            key={editing.id}
            txn={editing}
            mode="edit"
            onSaved={() => {
              setEditing(null);
              void load();
            }}
            onReopened={() => {
              setEditing(null);
              void load();
              onChanged();
            }}
            onDeleted={() => {
              setEditing(null);
              void load();
            }}
          />
        </Modal>
      )}
    </>
  );
}

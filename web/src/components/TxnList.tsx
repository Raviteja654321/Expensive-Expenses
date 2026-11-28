import { useMemo, useState } from "react";
import type { Transaction } from "../../../shared/types";
import { dayLabel, money } from "../lib/format";
import { useStore } from "../store";
import { Modal } from "./Modal";
import { ReviewForm } from "./ReviewForm";

/** Expenses grouped by day; tap one to edit it. */
export function TxnList({ items, empty }: { items: Transaction[]; empty?: React.ReactNode }) {
  const { categories, toast } = useStore();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const groups = useMemo(() => {
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of items) {
      const day = new Date(t.received_at).toDateString();
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(t);
      else out.push({ day, items: [t] });
    }
    return out;
  }, [items]);

  if (!items.length) return <>{empty ?? null}</>;

  return (
    <>
      {groups.map((g) => (
        <section key={g.day}>
          <div className="day-head">{dayLabel(g.items[0].received_at)}</div>
          <div className="txn-list">
            {g.items.map((t) => {
              const c = t.category_id ? catById.get(t.category_id) : undefined;
              return (
                <button key={t.id} className="txn-row" onClick={() => setEditing(t)}>
                  <span className="avatar" style={{ background: c ? `color-mix(in srgb, var(--c-${c.color}) 18%, var(--surface))` : undefined }} aria-hidden>
                    {c?.emoji ?? "🧾"}
                  </span>
                  <span className="grow">
                    <div className="title">{t.merchant}</div>
                    <div className="sub">
                      {c?.name ?? "Uncategorized"}
                      {t.kind === "split" && <span className={`pill${t.settled ? " settled" : ""}`}>{t.settled ? "Settled" : "Split"}{t.split_with ? ` · ${t.split_with}` : ""}</span>}
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
      {editing && (
        <Modal title="Edit expense" onClose={() => setEditing(null)}>
          <ReviewForm
            key={editing.id}
            txn={editing}
            mode="edit"
            onSaved={() => {
              setEditing(null);
              toast("Saved");
            }}
            onReopened={() => {
              setEditing(null);
              toast("Moved back to review");
            }}
            onDeleted={() => {
              setEditing(null);
              toast("Deleted");
            }}
          />
        </Modal>
      )}
    </>
  );
}

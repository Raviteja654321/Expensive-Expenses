import { useEffect, useState } from "react";
import type { Transaction } from "../../../shared/types";
import { suggestCategory } from "../lib/actions";
import { money } from "../lib/format";
import { useStore } from "../store";
import { Modal } from "./Modal";
import { ReviewForm } from "./ReviewForm";

/** Shows each new transaction as its own pop-up, one after another. */
export function ReviewQueue({ items, onClose }: { items: Transaction[]; onClose: () => void }) {
  const { data } = useStore();
  const [queue] = useState(items); // snapshot, so the order doesn't jump while you review
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState({ saved: 0, ignored: 0, skipped: 0, mine: 0 });

  // Skip anything another tab already reviewed.
  const live = queue[index] ? data.transactions.find((t) => t.id === queue[index].id) : undefined;
  const current = live && live.status === "pending" ? live : undefined;
  const stale = !!queue[index] && !current;
  useEffect(() => {
    if (stale) setIndex((i) => i + 1);
  }, [stale]);
  const total = queue.length;
  const next = () => setIndex((i) => i + 1);

  if (index >= total) {
    const currency = queue[0]?.currency ?? "INR";
    return (
      <Modal title="All caught up" onClose={onClose}>
        <div className="empty">
          <div className="big">🎉</div>
          <p className="done-line">
            {stats.saved} saved{stats.ignored ? ` · ${stats.ignored} ignored` : ""}
            {stats.skipped ? ` · ${stats.skipped} skipped` : ""}
          </p>
          {stats.saved > 0 && <p>That's {money(stats.mine, currency)} added to your own spending.</p>}
          {stats.skipped > 0 && <p className="small">Skipped ones will pop up again next time.</p>}
        </div>
        <button className="btn primary block" onClick={onClose}>Done</button>
      </Modal>
    );
  }
  if (!current) return null;

  return (
    <Modal title={total > 1 ? `New transaction ${index + 1} of ${total}` : "New transaction"} onClose={onClose}>
      {total > 1 && (
        <div className="progress" aria-hidden>
          {queue.map((t, i) => (
            <span key={t.id} className={i < index ? "done" : i === index ? "current" : ""} />
          ))}
        </div>
      )}
      <ReviewForm
        key={current.id}
        txn={current}
        mode="review"
        suggested={suggestCategory(data, current.merchant)}
        onSaved={(t) => {
          setStats((s) => ({ ...s, saved: s.saved + 1, mine: s.mine + (t.my_share ?? t.amount) }));
          next();
        }}
        onIgnored={() => {
          setStats((s) => ({ ...s, ignored: s.ignored + 1 }));
          next();
        }}
        onSkip={() => {
          setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
          next();
        }}
      />
    </Modal>
  );
}

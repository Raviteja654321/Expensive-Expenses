import { useMemo, useState } from "react";
import type { Transaction } from "../../../shared/types";
import { merchantKey } from "../../../shared/categorize";
import { money } from "../format";
import { Modal } from "./Modal";
import { ReviewForm } from "./ReviewForm";

/** Shows each new transaction as its own pop-up, one after another. */
export function ReviewQueue({ items, onClose, onChanged }: { items: Transaction[]; onClose: () => void; onChanged: () => void }) {
  const [queue] = useState(items); // snapshot so the order doesn't jump while you review
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState({ saved: 0, ignored: 0, skipped: 0, mine: 0 });
  // What you pick for a merchant now becomes the suggestion for its later transactions in this batch.
  const [learned, setLearned] = useState<Record<string, string>>({});

  const current = queue[index];
  const total = queue.length;
  const suggested = useMemo(() => {
    if (!current) return null;
    return learned[merchantKey(current.merchant)] ?? current.suggested_category_id ?? null;
  }, [current, learned]);

  const next = () => setIndex((i) => i + 1);

  if (!current) {
    const currency = queue[0]?.currency ?? "INR";
    return (
      <Modal title="All caught up" onClose={onClose}>
        <div className="empty">
          <div className="big">🎉</div>
          <p style={{ fontSize: 18, fontWeight: 700, margin: "4px 0", color: "var(--text)" }}>
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
        suggested={suggested}
        onSaved={(t) => {
          if (t.category_id) setLearned((l) => ({ ...l, [merchantKey(t.merchant)]: t.category_id! }));
          setStats((s) => ({ ...s, saved: s.saved + 1, mine: s.mine + (t.my_share ?? t.amount) }));
          onChanged();
          next();
        }}
        onIgnored={() => {
          setStats((s) => ({ ...s, ignored: s.ignored + 1 }));
          onChanged();
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

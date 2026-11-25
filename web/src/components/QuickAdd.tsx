import { useState } from "react";
import type { Transaction } from "../../../shared/types";
import { addManual, ValidationError } from "../lib/actions";
import { currencySymbol } from "../lib/format";
import { useStore } from "../store";
import { Modal } from "./Modal";

const VIA = ["GPay", "PhonePe", "Paytm", "Card", "Cash"];

function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Type in a payment yourself, e.g. right after paying with GPay or PhonePe. */
export function QuickAdd({ via: initialVia, onClose, onAdded }: { via?: string | null; onClose: () => void; onAdded: (t: Transaction) => void }) {
  const { apply, currency } = useStore();
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [via, setVia] = useState<string | null>(initialVia ? VIA.find((v) => v.toLowerCase() === initialVia.toLowerCase()) ?? initialVia : null);
  const [at, setAt] = useState(localInputValue(new Date()));
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      let created: Transaction | undefined;
      apply((d) => {
        const r = addManual(d, { amount: Number(amount), merchant, via, at: new Date(at).toISOString() });
        created = r.txn;
        return r.data;
      });
      if (created) onAdded(created);
    } catch (err) {
      setError(err instanceof ValidationError ? err.message : "Couldn't add that.");
    }
  }

  return (
    <Modal title="Add an expense" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="quick-amount">
          <span>{currencySymbol(currency)}</span>
          <input inputMode="decimal" placeholder="0" value={amount} autoFocus onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Amount" />
        </div>
        <div>
          <label className="field" htmlFor="qa-m">Paid to</label>
          <input id="qa-m" className="input" placeholder="e.g. Chai Point, Auto, Rahul" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label className="field">Paid with</label>
          <div className="chips">
            {VIA.map((v) => (
              <button type="button" key={v} className="chip sm" aria-pressed={via === v} onClick={() => setVia(via === v ? null : v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="field" htmlFor="qa-t">When</label>
          <input id="qa-t" className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" disabled={!Number(amount)}>Next: category →</button>
        <p className="small muted center" style={{ margin: 0 }}>If a bank SMS for this payment shows up later, the app will spot it.</p>
      </form>
    </Modal>
  );
}

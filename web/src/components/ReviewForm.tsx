import { useEffect, useMemo, useState } from "react";
import type { ReviewInput, Transaction, TxnKind } from "../../../shared/types";
import { clearDuplicate, deleteTxn, ignoreTxn, markDuplicate, reopenTxn, reviewTxn, ValidationError } from "../lib/actions";
import { currencySymbol, money, round2, when } from "../lib/format";
import { useStore } from "../store";
import { CategoryPicker } from "./CategoryPicker";

type SplitMode = "equal" | "amount" | "percent";

interface Props {
  txn: Transaction;
  mode: "review" | "edit";
  suggested?: string | null;
  onSaved: (t: Transaction) => void;
  onIgnored?: () => void;
  onSkip?: () => void;
  onReopened?: () => void;
  onDeleted?: () => void;
}

const splitNames = (s: string | null | undefined) =>
  (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export function ReviewForm({ txn, mode, suggested, onSaved, onIgnored, onSkip, onReopened, onDeleted }: Props) {
  const { data, apply, toast } = useStore();
  const dup = txn.dup_of ? data.transactions.find((t) => t.id === txn.dup_of && t.status !== "ignored") : undefined;
  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of [...data.transactions].reverse()) {
      for (const n of splitNames(t.split_with)) if (!seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
    }
    return [...seen.values()].slice(0, 30);
  }, [data.transactions]);
  const cur = txn.currency;
  const sym = currencySymbol(cur);

  const [step, setStep] = useState<"who" | "details">(mode === "edit" ? "details" : "who");
  const [kind, setKind] = useState<TxnKind>(txn.kind ?? "personal");
  const [categoryId, setCategoryId] = useState<string | null>(txn.category_id ?? suggested ?? null);
  const [editingTop, setEditingTop] = useState(false);
  const [amountStr, setAmountStr] = useState(String(txn.amount));
  const [merchant, setMerchant] = useState(txn.merchant);
  const [showRaw, setShowRaw] = useState(false);
  const [note, setNote] = useState(txn.note ?? "");

  const [splitMode, setSplitMode] = useState<SplitMode>(txn.kind === "split" ? "amount" : "equal");
  const [peopleCount, setPeopleCount] = useState(2);
  const [shareStr, setShareStr] = useState(txn.my_share != null && txn.kind === "split" ? String(txn.my_share) : "");
  const [pctStr, setPctStr] = useState("50");
  const [names, setNames] = useState<string[]>(splitNames(txn.split_with));
  const [nameInput, setNameInput] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggestions for a later item can change after you add a category or categorize an earlier one.
  useEffect(() => {
    if (mode === "review" && !txn.category_id) setCategoryId(suggested ?? null);
  }, [suggested, mode, txn.category_id]);

  const amount = Number(amountStr);
  const amountOk = Number.isFinite(amount) && amount > 0;
  const effectivePeople = peopleCount;

  const myShare: number | null = useMemo(() => {
    if (!amountOk) return null;
    if (kind === "personal") return amount;
    if (splitMode === "equal") return round2(amount / effectivePeople);
    if (splitMode === "percent") {
      const p = Number(pctStr);
      return Number.isFinite(p) && p >= 0 && p <= 100 ? round2((amount * p) / 100) : null;
    }
    const s = Number(shareStr);
    return shareStr.trim() !== "" && Number.isFinite(s) && s >= 0 && s <= amount ? round2(s) : null;
  }, [amountOk, amount, kind, splitMode, effectivePeople, pctStr, shareStr]);

  function addName(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...names];
    for (const p of parts) if (!next.some((n) => n.toLowerCase() === p.toLowerCase())) next.push(p);
    setNames(next);
    if (splitMode === "equal") setPeopleCount((c) => Math.max(c, next.length + 1));
    setNameInput("");
  }

  function choose(k: TxnKind) {
    setKind(k);
    setError(null);
    setStep("details");
  }

  function run(fn: () => void) {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : "Something went wrong.");
    }
  }

  function ignore() {
    run(() => {
      apply((d) => ignoreTxn(d, txn.id));
      onIgnored?.();
    });
  }

  function save() {
    setError(null);
    if (!amountOk) return setError("Enter a valid amount.");
    if (kind === "personal" && !categoryId) return setError("Pick a category.");
    if (kind === "split" && myShare == null) return setError("Enter your share (between 0 and the full amount).");
    const splitWith = names.concat(nameInput.trim() ? [nameInput.trim()] : []);
    const body: ReviewInput = {
      kind,
      category_id: categoryId,
      amount: round2(amount),
      merchant: merchant.trim() || txn.merchant,
      my_share: kind === "split" ? myShare : null,
      split_with: kind === "split" ? splitWith.join(", ") : null,
      note: note.trim() || null,
    };
    setBusy(true);
    run(() => {
      let saved: Transaction | undefined;
      apply((d) => {
        const next = reviewTxn(d, txn.id, body);
        saved = next.transactions.find((t) => t.id === txn.id);
        return next;
      });
      if (saved) onSaved(saved);
    });
    setBusy(false);
  }

  function reopen() {
    run(() => {
      apply((d) => reopenTxn(d, txn.id));
      onReopened?.();
    });
  }

  function remove() {
    if (!confirm("Delete this expense? This can't be undone.")) return;
    run(() => {
      apply((d) => deleteTxn(d, txn.id));
      onDeleted?.();
    });
  }

  async function shareSplit() {
    const owed = myShare != null && amountOk ? round2(amount - myShare) : 0;
    const who = names.length ? names.join(", ") : "friends";
    const text = `${merchant}: ${money(amount, cur)} on ${new Date(txn.received_at).toLocaleDateString()}. My share ${money(myShare ?? 0, cur)}, so ${who} owe${names.length === 1 ? "s" : ""} ${money(owed, cur)}${names.length > 1 ? ` (${money(round2(owed / names.length), cur)} each)` : ""}.`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied. Paste it in Splitwise or a chat.");
      }
    } catch {
      /* share sheet dismissed */
    }
  }

  const unusedPeople = people.filter((p) => !names.some((n) => n.toLowerCase() === p.toLowerCase())).slice(0, 8);

  return (
    <div className="slide-in">
      {/* ---------- what was this? ---------- */}
      <div className="txn-hero">
        {editingTop ? (
          <div className="stack" style={{ textAlign: "left" }}>
            <div>
              <label className="field" htmlFor="m">Merchant</label>
              <input id="m" className="input" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={80} />
            </div>
            <div>
              <label className="field" htmlFor="a">Amount</label>
              <div className="prefix-input">
                <span>{sym}</span>
                <input id="a" className="input tnum" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
              </div>
            </div>
            <button className="btn sm" onClick={() => setEditingTop(false)}>Done</button>
          </div>
        ) : (
          <>
            <div className="merchant">{merchant}</div>
            <div className="amount tnum">{amountOk ? money(amount, cur) : "—"}</div>
            <div className="meta">
              {when(txn.received_at)}
            </div>
            <div className="row" style={{ justifyContent: "center", gap: 16, marginTop: 6 }}>
              <button className="linkbtn small" onClick={() => setEditingTop(true)}>Edit amount / merchant</button>
              <button className="linkbtn small" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Hide message" : "Show message"}</button>
            </div>
          </>
        )}
        {showRaw && <div className="raw-sms">{txn.raw}</div>}
      </div>

      {dup && mode === "review" && (
        <div className="dup-banner">
          <strong>Looks like a payment you already have</strong>
          <span>
            {dup.merchant} · {money(dup.amount, dup.currency)} · {when(dup.received_at)}
            {dup.source === "quick" ? " (added by you)" : " (from a bank SMS)"}
          </span>
          <div className="row">
            <button className="btn sm primary" onClick={() => run(() => { apply((d) => markDuplicate(d, txn.id)); onIgnored?.(); })}>Same payment, skip this</button>
            <button className="btn sm" onClick={() => run(() => apply((d) => clearDuplicate(d, txn.id)))}>Different payment</button>
          </div>
        </div>
      )}

      {step === "who" && (
        <div>
          <div className="question">Who was this for?</div>
          <button className="choice" onClick={() => choose("personal")}>
            <span className="emoji" aria-hidden>🙋</span>
            <span><strong>Just me</strong><small>The whole amount is my own expense</small></span>
          </button>
          <button className="choice" onClick={() => choose("split")}>
            <span className="emoji" aria-hidden>👥</span>
            <span><strong>Me and friends</strong><small>I paid, but part of it is theirs</small></span>
          </button>
          <button className="choice quiet" onClick={ignore}>
            <span className="emoji" aria-hidden>🚫</span>
            <span><strong>Not an expense</strong><small>Transfer to my own account, refund, wrong message…</small></span>
          </button>
          {error && <div className="error">{error}</div>}
          {onSkip && (
            <div className="center" style={{ marginTop: 6 }}>
              <button className="linkbtn" onClick={onSkip}>Skip for now</button>
            </div>
          )}
        </div>
      )}

      {step === "details" && (
        <div className="stack">
          {mode === "edit" && (
            <div className="seg" role="group" aria-label="Type">
              <button aria-pressed={kind === "personal"} onClick={() => setKind("personal")}>🙋 Just me</button>
              <button aria-pressed={kind === "split"} onClick={() => setKind("split")}>👥 Split</button>
            </div>
          )}

          {kind === "split" && (
            <div className="card" style={{ marginBottom: 0 }}>
              <div className="question" style={{ marginTop: 0 }}>What's your share?</div>
              <div className="seg" role="group" aria-label="How to split">
                <button aria-pressed={splitMode === "equal"} onClick={() => setSplitMode("equal")}>Equally</button>
                <button aria-pressed={splitMode === "amount"} onClick={() => setSplitMode("amount")}>Exact amount</button>
                <button aria-pressed={splitMode === "percent"} onClick={() => setSplitMode("percent")}>Percent</button>
              </div>

              <div style={{ margin: "14px 0" }}>
                {splitMode === "equal" && (
                  <div className="spread">
                    <span className="muted">People, including you</span>
                    {(
                      <div className="stepper">
                        <button aria-label="Fewer people" onClick={() => setPeopleCount((c) => Math.max(2, c - 1))}>−</button>
                        <output aria-live="polite">{peopleCount}</output>
                        <button aria-label="More people" onClick={() => setPeopleCount((c) => Math.min(30, c + 1))}>+</button>
                      </div>
                    )}
                  </div>
                )}
                {splitMode === "amount" && (
                  <div>
                    <label className="field" htmlFor="share">My share</label>
                    <div className="prefix-input">
                      <span>{sym}</span>
                      <input id="share" className="input tnum" inputMode="decimal" placeholder="0" value={shareStr} autoFocus onChange={(e) => setShareStr(e.target.value)} />
                    </div>
                  </div>
                )}
                {splitMode === "percent" && (
                  <div>
                    <label className="field" htmlFor="pct">My share (%)</label>
                    <input id="pct" className="input tnum" inputMode="decimal" value={pctStr} onChange={(e) => setPctStr(e.target.value)} />
                  </div>
                )}
              </div>

              <div className="summary-line tnum">
                <span>You: {myShare != null ? money(myShare, cur) : "—"}</span>
                <span>Friends owe you: {myShare != null && amountOk ? money(round2(amount - myShare), cur) : "—"}</span>
              </div>

              <h3>Split with</h3>
              {names.length > 0 && (
                <div className="chips" style={{ marginBottom: 8 }}>
                  {names.map((n) => (
                    <button key={n} className="chip" aria-pressed="true" onClick={() => setNames(names.filter((x) => x !== n))} aria-label={`Remove ${n}`}>
                      {n} <span className="x" aria-hidden>✕</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                className="input"
                placeholder="Friend's name, then Enter"
                value={nameInput}
                onChange={(e) => (e.target.value.endsWith(",") ? addName(e.target.value) : setNameInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addName(nameInput);
                  }
                }}
                onBlur={() => nameInput.trim() && addName(nameInput)}
                aria-label="Friend's name"
              />
              {unusedPeople.length > 0 && (
                <div className="chips" style={{ marginTop: 8 }}>
                  {unusedPeople.map((p) => (
                    <button key={p} className="chip" onClick={() => addName(p)}>＋ {p}</button>
                  ))}
                </div>
              )}

              {myShare != null && amountOk && myShare < amount && (
                <button type="button" className="linkbtn small" style={{ marginTop: 10 }} onClick={() => void shareSplit()}>
                  📤 Send this split to friends / Splitwise
                </button>
              )}
            </div>
          )}

          <div>
            <div className="question">{kind === "split" ? "Category for your share" : "Which category?"}</div>
            <CategoryPicker value={categoryId} suggested={suggested} onChange={setCategoryId} />
          </div>

          <details>
            <summary className="small muted">Add a note</summary>
            <input className="input" style={{ marginTop: 8 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Goa trip dinner" maxLength={300} />
          </details>

          {error && <div className="error">{error}</div>}

          <div className="sticky-actions">
            <button className="btn primary block" disabled={busy} onClick={save}>
              {mode === "edit" ? "Save changes" : "Save"}
            </button>
            <div className="spread" style={{ marginTop: 8 }}>
              {mode === "review" ? (
                <button className="linkbtn" onClick={() => setStep("who")}>‹ Back</button>
              ) : (
                <button className="linkbtn" onClick={reopen}>Move back to review</button>
              )}
              {mode === "review" && onSkip ? (
                <button className="linkbtn" onClick={onSkip}>Skip for now</button>
              ) : mode === "edit" ? (
                <button className="linkbtn" style={{ color: "var(--danger)" }} onClick={remove}>Delete</button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { ReviewInput, Transaction, TxnKind } from "../../../shared/types";
import { api } from "../api";
import { useApp } from "../context";
import { currencySymbol, money, round2, when } from "../format";
import { CategoryPicker } from "./CategoryPicker";

type SplitMode = "equal" | "amount" | "percent";

interface Props {
  txn: Transaction;
  mode: "review" | "edit";
  suggested?: string | null;
  onSaved: (t: Transaction) => void;
  onIgnored?: (t: Transaction) => void;
  onSkip?: () => void;
  onReopened?: (t: Transaction) => void;
  onDeleted?: () => void;
}

const splitNames = (s: string | null | undefined) =>
  (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export function ReviewForm({ txn, mode, suggested, onSaved, onIgnored, onSkip, onReopened, onDeleted }: Props) {
  const { settings, people, splitwise, loadSplitwise, toast, reloadPeople } = useApp();
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

  const swAvailable = !!settings?.splitwise_connected && !txn.splitwise_expense_id;
  const [useSw, setUseSw] = useState(false);
  const [swGroup, setSwGroup] = useState<number | null>(null);
  const [swFriends, setSwFriends] = useState<number[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggestions for a later item can change after you add a category or categorize an earlier one.
  useEffect(() => {
    if (mode === "review" && !txn.category_id) setCategoryId(suggested ?? null);
  }, [suggested, mode, txn.category_id]);

  useEffect(() => {
    if (useSw) void loadSplitwise().catch((e) => setError((e as Error).message));
  }, [useSw, loadSplitwise]);

  const amount = Number(amountStr);
  const amountOk = Number.isFinite(amount) && amount > 0;
  const effectivePeople = useSw && swFriends.length ? swFriends.length + 1 : peopleCount;

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

  const swGroupObj = splitwise?.groups.find((g) => g.id === swGroup) ?? null;
  const swFriendList = useMemo(() => {
    const all = splitwise?.friends ?? [];
    return swGroupObj ? all.filter((f) => swGroupObj.member_ids.includes(f.id)) : all;
  }, [splitwise, swGroupObj]);

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

  async function ignore() {
    setBusy(true);
    setError(null);
    try {
      onIgnored?.(await api<Transaction>(`/transactions/${txn.id}/ignore`, { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    if (!amountOk) return setError("Enter a valid amount.");
    if (kind === "personal" && !categoryId) return setError("Pick a category.");
    if (kind === "split" && myShare == null) return setError("Enter your share (between 0 and the full amount).");
    if (useSw && !swFriends.length) return setError("Pick at least one Splitwise friend.");

    let splitWith = names.concat(nameInput.trim() ? [nameInput.trim()] : []);
    if (useSw && splitwise) {
      const swNames = swFriends.map((id) => splitwise.friends.find((f) => f.id === id)?.name).filter(Boolean) as string[];
      splitWith = [...new Set([...splitWith, ...swNames])];
    }

    const body: ReviewInput = {
      kind,
      category_id: categoryId,
      amount: round2(amount),
      merchant: merchant.trim() || txn.merchant,
      my_share: kind === "split" ? myShare : null,
      split_with: kind === "split" ? splitWith.join(", ") : null,
      note: note.trim() || null,
      splitwise: kind === "split" && useSw ? { group_id: swGroup, friend_ids: swFriends } : null,
    };
    setBusy(true);
    try {
      const saved = await api<Transaction>(`/transactions/${txn.id}/review`, { body });
      if (kind === "split" && splitWith.length) void reloadPeople().catch(() => {});
      if (saved.splitwise_expense_id && !txn.splitwise_expense_id) toast("Added to Splitwise ✓");
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    try {
      onReopened?.(await api<Transaction>(`/transactions/${txn.id}/reopen`, { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this expense? This can't be undone.")) return;
    setBusy(true);
    try {
      await api(`/transactions/${txn.id}`, { method: "DELETE" });
      onDeleted?.();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
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
              {txn.sender ? ` · ${txn.sender}` : ""}
            </div>
            <div className="row" style={{ justifyContent: "center", gap: 16, marginTop: 6 }}>
              <button className="linkbtn small" onClick={() => setEditingTop(true)}>Edit amount / merchant</button>
              <button className="linkbtn small" onClick={() => setShowRaw((v) => !v)}>{showRaw ? "Hide message" : "Show message"}</button>
            </div>
          </>
        )}
        {showRaw && <div className="raw-sms">{txn.raw}</div>}
      </div>

      {step === "who" && (
        <div>
          <div className="question">Who was this for?</div>
          <button className="choice" onClick={() => choose("personal")}>
            <span className="emoji" aria-hidden>🙋</span>
            <span><strong>Just me</strong><small>The whole amount is my own expense</small></span>
          </button>
          <button className="choice" onClick={() => choose("split")}>
            <span className="emoji" aria-hidden>👥</span>
            <span><strong>Me and friends</strong><small>I paid, but part of it is theirs (Splitwise)</small></span>
          </button>
          <button className="choice quiet" onClick={() => void ignore()} disabled={busy}>
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
                    {useSw && swFriends.length ? (
                      <strong>{effectivePeople}</strong>
                    ) : (
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

              {swAvailable && (
                <>
                  <hr className="sep" />
                  <label className="spread" style={{ cursor: "pointer" }}>
                    <span>
                      <strong>Also add to Splitwise</strong>
                      <br />
                      <span className="small muted">You paid {amountOk ? money(amount, cur) : ""}; friends owe the rest</span>
                    </span>
                    <input type="checkbox" checked={useSw} onChange={(e) => setUseSw(e.target.checked)} style={{ width: 22, height: 22 }} />
                  </label>
                  {useSw && (
                    <div style={{ marginTop: 12 }}>
                      {!splitwise ? (
                        <div className="muted small">Loading your Splitwise friends…</div>
                      ) : splitwise.error ? (
                        <div className="error">{splitwise.error}</div>
                      ) : (
                        <div className="stack">
                          {splitwise.groups.length > 0 && (
                            <select
                              className="input"
                              value={swGroup ?? ""}
                              onChange={(e) => {
                                setSwGroup(e.target.value ? Number(e.target.value) : null);
                                setSwFriends([]);
                              }}
                              aria-label="Splitwise group"
                            >
                              <option value="">No group</option>
                              {splitwise.groups.map((g) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          )}
                          <div className="chips">
                            {swFriendList.map((f) => (
                              <button
                                key={f.id}
                                className="chip"
                                aria-pressed={swFriends.includes(f.id)}
                                onClick={() => setSwFriends((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}
                              >
                                {f.name}
                              </button>
                            ))}
                            {swFriendList.length === 0 && <span className="muted small">No friends found{swGroupObj ? " in this group" : ""}.</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {txn.splitwise_expense_id && <p className="small muted" style={{ marginBottom: 0 }}>✓ Already on Splitwise</p>}
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
            <button className="btn primary block" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : mode === "edit" ? "Save changes" : useSw ? "Save & add to Splitwise" : "Save"}
            </button>
            <div className="spread" style={{ marginTop: 8 }}>
              {mode === "review" ? (
                <button className="linkbtn" onClick={() => setStep("who")}>‹ Back</button>
              ) : (
                <button className="linkbtn" onClick={() => void reopen()} disabled={busy}>Move back to review</button>
              )}
              {mode === "review" && onSkip ? (
                <button className="linkbtn" onClick={onSkip}>Skip for now</button>
              ) : mode === "edit" ? (
                <button className="linkbtn" style={{ color: "var(--danger)" }} onClick={() => void remove()} disabled={busy}>Delete</button>
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

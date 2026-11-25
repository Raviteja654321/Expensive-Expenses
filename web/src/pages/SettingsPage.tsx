import { useRef, useState } from "react";
import type { AppData } from "../../../shared/types";
import { useStore } from "../store";
import { mergeBackup, splitInbox, validateBackup, ValidationError, type IngestResult } from "../lib/actions";
import { money } from "../lib/format";
import { sampleInbox } from "../lib/samples";
import { IphoneSetup } from "../components/IphoneSetup";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"];

function AddMessages({ onQueued }: { onQueued: () => void }) {
  const { ingest, currency } = useStore();
  const [text, setText] = useState("");
  const [results, setResults] = useState<IngestResult[] | null>(null);

  function submit(body: string, source: "manual" | "sample") {
    const r = ingest(splitInbox(body), source);
    setResults(r);
    if (r.some((x) => x.status === "queued")) {
      setText("");
      onQueued();
    }
  }

  async function fromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) submit(t, "manual");
      else setResults([{ text: "", status: "ignored", reason: "the clipboard is empty" }]);
    } catch {
      setResults([{ text: "", status: "ignored", reason: "couldn't read the clipboard, so paste into the box instead" }]);
    }
  }

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Copy a bank SMS (long-press it in Messages → Copy) and paste it here. You can paste several at once, separated by a blank line.
      </p>
      <button className="btn primary" onClick={() => void fromClipboard()}>📋 Paste from clipboard</button>
      <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste here: Rs 250.00 debited from A/c XX1234 to SWIGGY" />
      <div className="row wrap">
        <button className="btn" disabled={!text.trim()} onClick={() => submit(text, "manual")}>Add to review</button>
        <button className="btn ghost" onClick={() => submit(sampleInbox(currency), "sample")}>✨ Add sample messages</button>
      </div>
      {results && (
        <ul className="small result-list">
          {results.map((r, i) => (
            <li key={i}>
              {r.status === "queued" && r.txn && <>✅ <strong>{money(r.txn.amount, r.txn.currency)}</strong> at {r.txn.merchant}: added for review</>}
              {r.status === "duplicate" && <>↩︎ Already added: <span className="muted">{r.text}…</span></>}
              {r.status === "ignored" && <>⏭ Skipped ({r.reason}){r.text && <>: <span className="muted">{r.text}…</span></>}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Backup() {
  const { data, apply, replaceAll, persisted, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const last = data.last_backup_at ? new Date(data.last_backup_at) : null;

  async function save() {
    const stamp = new Date().toISOString();
    const payload: AppData = { ...data, last_backup_at: stamp };
    const name = `expenses-backup-${stamp.slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const file = new File([blob], name, { type: "application/json" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Expenses backup" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
      apply((d) => ({ ...d, last_backup_at: stamp }));
      toast("Backup saved");
    } catch {
      /* share sheet dismissed */
    }
  }

  async function restore(file: File) {
    try {
      const backup = validateBackup(JSON.parse(await file.text()));
      let added = 0;
      if (!data.transactions.length) {
        replaceAll(backup);
        added = backup.transactions.length;
      } else {
        const r = mergeBackup(data, backup);
        replaceAll(r.data);
        added = r.added;
      }
      toast(`Restored: ${added} transaction${added === 1 ? "" : "s"} added`);
    } catch (e) {
      toast(e instanceof ValidationError ? e.message : "Couldn't read that file.");
    }
  }

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Everything is stored only in this browser on this phone. Save a backup to Files (or iCloud Drive) so you never lose it, and to move to a
        new phone.
      </p>
      <div className="spread small">
        <span>Last backup</span>
        <strong>{last ? last.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Never"}</strong>
      </div>
      <div className="spread small">
        <span>Protected from automatic clean-up</span>
        <strong>{persisted === true ? "Yes ✓" : persisted === false ? "Not yet: keep backups" : "Unknown"}</strong>
      </div>
      <div className="row wrap">
        <button className="btn primary" onClick={() => void save()}>💾 Save backup</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Restore from backup</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
      </div>
    </div>
  );
}

function exportCsv(data: AppData) {
  const cats = new Map(data.categories.map((c) => [c.id, c.name]));
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = data.transactions
    .filter((t) => t.status === "done")
    .sort((a, b) => a.received_at.localeCompare(b.received_at))
    .map((t) => [t.received_at, t.merchant, t.amount, t.currency, t.kind, t.category_id ? cats.get(t.category_id) : "", t.my_share, t.split_with, t.settled ? "yes" : "", t.note].map(cell).join(","));
  const csv = ["date,merchant,amount,currency,type,category,my_share,split_with,settled,note", ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SettingsPage({ onQueued }: { onQueued: () => void }) {
  const { data, apply, eraseAll, toast } = useStore();
  const p = data.profile!;
  const [name, setName] = useState(p.name);

  const setProfile = (patch: Partial<typeof p>) => apply((d) => ({ ...d, profile: { ...d.profile!, ...patch } }));

  return (
    <>
      <div className="card">
        <h2>👤 You</h2>
        <div className="stack">
          <div>
            <label className="field" htmlFor="pname">Your name</label>
            <input id="pname" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => name !== p.name && setProfile({ name: name.trim() })} />
          </div>
          <div className="spread">
            <label className="field" htmlFor="pcur" style={{ margin: 0 }}>Currency</label>
            <select id="pcur" className="input" style={{ width: 110 }} value={p.currency} onChange={(e) => setProfile({ currency: e.target.value })}>
              {[...new Set([p.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Theme</label>
            <div className="seg" role="group" aria-label="Theme">
              {(["auto", "light", "dark"] as const).map((t) => (
                <button key={t} aria-pressed={p.theme === t} onClick={() => setProfile({ theme: t })}>
                  {t === "auto" ? "📱 Auto" : t === "light" ? "☀️ Light" : "🌙 Dark"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card" id="iphone">
        <h2>📱 Connect your iPhone</h2>
        <IphoneSetup />
      </div>

      <div className="card">
        <h2>✍️ Add messages yourself</h2>
        <AddMessages onQueued={onQueued} />
      </div>

      <div className="card">
        <h2>💾 Backup & restore</h2>
        <Backup />
      </div>

      <div className="card">
        <h2>⬇️ Export</h2>
        <button className="btn" onClick={() => exportCsv(data)}>Download expenses as CSV</button>
        <p className="small muted" style={{ marginBottom: 0 }}>Opens in Numbers, Excel or Google Sheets.</p>
      </div>

      <div className="card">
        <h2>🗑️ Erase</h2>
        <p className="small muted" style={{ marginTop: 0 }}>Deletes every transaction, category and setting from this device.</p>
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm("Erase all your expense data from this device?")) return;
            if (!confirm("Really erase? Unless you saved a backup, this can't be undone.")) return;
            await eraseAll();
            toast("All data erased");
          }}
        >
          Erase all data
        </button>
      </div>
      <p className="center small muted footnote">Expensive Expenses · your data never leaves this device.</p>
    </>
  );
}

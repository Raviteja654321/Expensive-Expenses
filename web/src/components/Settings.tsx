import { useState } from "react";
import { api, downloadCsv } from "../api";
import { useApp } from "../context";
import { money } from "../format";
import { IphoneSetup } from "./IphoneSetup";

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"];

interface IngestResult {
  text: string;
  status: "queued" | "duplicate" | "ignored";
  reason?: string;
  amount?: number;
  merchant?: string;
}

function samples(): string {
  const ref = () => String(Math.floor(1e11 + Math.random() * 9e11));
  return [
    `Sent Rs.480.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn ${new Date().toLocaleDateString("en-GB")}\nRef ${ref()}\nNot You? Call 18002586161`,
    `INR 1,200.00 spent using ICICI Bank Card XX1234 on ${new Date().getDate()}-Nov-26 on PVR INOX LTD. Avl Limit: INR 1,23,456.00. Ref ${ref()}`,
    `Dear UPI user A/C X1234 debited by 186.0 on date ${new Date().getDate()}Nov26 trf to UBER INDIA Refno ${ref()}. If not u? call 1800111109. -SBI`,
  ].join("\n\n");
}

function AddMessages({ onAdded }: { onAdded: () => void }) {
  const { settings } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<IngestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ results: IngestResult[] }>("/messages", { body: { text: body } });
      setResults(r.results);
      if (r.results.some((x) => x.status === "queued")) {
        setText("");
        onAdded();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Paste one or more bank SMS (separate them with a blank line). Useful for older messages, or to check the setup.
      </p>
      <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Rs 250.00 debited from A/c XX1234 to SWIGGY on 24-11-26…" />
      <div className="row">
        <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void submit(text)}>Add to review</button>
        <button className="btn" disabled={busy} onClick={() => void submit(samples())}>Try 3 sample messages</button>
      </div>
      {error && <div className="error">{error}</div>}
      {results && (
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          {results.map((r, i) => (
            <li key={i}>
              {r.status === "queued" && <>✅ <strong>{money(r.amount, settings?.currency)}</strong> at {r.merchant} added for review</>}
              {r.status === "duplicate" && <>↩︎ Already added: <span className="muted">{r.text}…</span></>}
              {r.status === "ignored" && <>⏭ Skipped ({r.reason}): <span className="muted">{r.text}…</span></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Splitwise() {
  const { settings, reloadSettings, loadSplitwise, toast } = useApp();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api("/settings", { method: "PATCH", body: { splitwise_key: key.trim() } });
      await reloadSettings();
      const meta = await loadSplitwise(true);
      setKey("");
      toast(meta?.me ? `Connected as ${meta.me.name}` : "Splitwise connected");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await api("/settings", { method: "PATCH", body: { splitwise_key: null } });
    await reloadSettings();
    await loadSplitwise(true);
  }

  if (settings?.splitwise_connected) {
    return (
      <div className="spread">
        <span className="success small" style={{ padding: "6px 10px" }}>✓ Connected</span>
        <button className="btn sm" onClick={() => void disconnect()}>Disconnect</button>
      </div>
    );
  }
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Optional. With Splitwise connected, split expenses can be added to Splitwise straight from the pop-up. Without it the app still records your share.
      </p>
      <ol className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
        <li>Open <a href="https://secure.splitwise.com/apps" target="_blank" rel="noreferrer">secure.splitwise.com/apps</a> and log in.</li>
        <li>Tap <strong>Register your application</strong>. Any name works (e.g. "My expenses"); use this site's address as the homepage URL.</li>
        <li>On the next page, copy the <strong>API key</strong> and paste it here.</li>
      </ol>
      <div className="row">
        <input className="input grow" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Splitwise API key" autoComplete="off" />
        <button className="btn primary" disabled={busy || !key.trim()} onClick={() => void connect()}>{busy ? "Checking…" : "Connect"}</button>
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

function Security({ onLock }: { onLock: () => void }) {
  const { reloadSettings, toast } = useApp();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function change() {
    setError(null);
    try {
      await api("/passcode", { body: { current, next } });
      setCurrent("");
      setNext("");
      toast("Passcode changed");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function rotate() {
    if (!confirm("Create a new iPhone link? The old one stops working, so you'll need to paste the new link into your automations.")) return;
    await api("/settings/rotate-token", { method: "POST" });
    await reloadSettings();
    toast("New link created. Update your automations.");
  }

  return (
    <div className="stack">
      <label className="field" style={{ marginBottom: 0 }}>Change passcode</label>
      <input className="input" type="password" placeholder="Current passcode" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      <input className="input" type="password" placeholder="New passcode (4+ characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      {error && <div className="error">{error}</div>}
      <button className="btn" disabled={!current || next.length < 4} onClick={() => void change()}>Change passcode</button>
      <hr className="sep" />
      <button className="btn" onClick={() => void rotate()}>Create a new iPhone link</button>
      <button className="btn danger" onClick={onLock}>Lock this device</button>
    </div>
  );
}

export function SettingsPage({ onLock, onMessagesAdded }: { onLock: () => void; onMessagesAdded: () => void }) {
  const { settings, reloadSettings, toast } = useApp();

  async function setCurrency(c: string) {
    try {
      await api("/settings", { method: "PATCH", body: { currency: c } });
      await reloadSettings();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <h2>📱 iPhone setup</h2>
        <IphoneSetup />
      </div>
      <div className="card">
        <h2>✍️ Add messages manually</h2>
        <AddMessages onAdded={onMessagesAdded} />
      </div>
      <div className="card">
        <h2>💱 Currency</h2>
        <div className="spread">
          <span className="small muted">Used for totals, and for SMS that don't say the currency.</span>
          <select className="input" style={{ width: 110 }} value={settings?.currency ?? "INR"} onChange={(e) => void setCurrency(e.target.value)} aria-label="Currency">
            {[...new Set([...(settings ? [settings.currency] : []), ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="card">
        <h2>👥 Splitwise</h2>
        <Splitwise />
      </div>
      <div className="card">
        <h2>⬇️ Export</h2>
        <button className="btn" onClick={() => void downloadCsv().catch((e) => toast((e as Error).message))}>Download all expenses (CSV)</button>
      </div>
      <div className="card">
        <h2>🔒 Security</h2>
        <Security onLock={onLock} />
      </div>
    </>
  );
}

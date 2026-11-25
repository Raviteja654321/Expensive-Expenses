import { useState } from "react";
import { api } from "../api";
import { useApp } from "../context";

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function IphoneSetup() {
  const { settings } = useApp();
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  if (!settings) return null;
  const url = `${location.origin}/api/ingest?token=${settings.ingest_token}`;

  async function runTest() {
    try {
      const r = await fetch(url);
      const data = (await r.json()) as { message?: string; error?: string };
      setTest({ ok: r.ok, msg: data.message ?? data.error ?? `HTTP ${r.status}` });
    } catch (e) {
      setTest({ ok: false, msg: (e as Error).message });
    }
  }

  return (
    <div>
      <p className="small muted" style={{ marginTop: 0 }}>
        iOS doesn't let websites read your Messages. Instead, an <strong>automation in the Shortcuts app</strong> forwards each bank
        SMS to this site as it arrives, and it waits here until you review it. Set it up once; it takes about 3 minutes.
      </p>

      <label className="field">Your personal link (keep it private)</label>
      <div className="copybox">
        <code>{url}</code>
        <Copy text={url} />
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="btn sm" onClick={() => void runTest()}>Test link</button>
        {test && <span className={test.ok ? "success small" : "error small"} style={{ padding: "6px 10px" }}>{test.msg}</span>}
      </div>

      <ol className="steps">
        <li>
          On your iPhone, open the <strong>Shortcuts</strong> app → <strong>Automation</strong> tab → tap <kbd>+</kbd> (or <strong>New Automation</strong>).
        </li>
        <li>
          Choose <strong>Message</strong>. Tap <strong>Message Contains</strong> and type <code>debited</code>. Leave <em>Sender</em> as anyone.
          Select <strong>Run Immediately</strong> (you can turn off <em>Notify When Run</em>), then tap <strong>Next</strong>.
        </li>
        <li>
          Tap <strong>New Blank Automation</strong> → <strong>Add Action</strong> → search for <strong>Get Contents of URL</strong> and add it.
        </li>
        <li>
          Tap <strong>URL</strong> and paste your personal link from above.
        </li>
        <li>
          Tap the <kbd>›</kbd> on the action to show more options:
          <ul className="small" style={{ paddingLeft: 18, margin: "6px 0 0" }}>
            <li><strong>Method</strong>: POST</li>
            <li><strong>Request Body</strong>: JSON</li>
            <li>
              <strong>Add new field → Text</strong>. Key: <code>text</code>. For the value, tap it and choose <strong>Shortcut Input</strong> from
              the bar above the keyboard, then tap the blue <em>Shortcut Input</em> bubble and pick <strong>Content</strong>.
            </li>
            <li className="muted">Optional: another Text field <code>sender</code> → Shortcut Input → <strong>Sender</strong>.</li>
          </ul>
        </li>
        <li>
          Tap <strong>Done</strong>. Then make two more automations the same way, with <code>spent</code> and <code>Sent Rs</code> (and any other word your bank uses, like{" "}
          <code>charged</code>). If a message matches two automations it's still only counted once.
        </li>
        <li>
          The first time it runs, iOS may ask whether Shortcuts can connect to this site. Choose <strong>Always Allow</strong>.
        </li>
      </ol>

      <details className="small" style={{ marginTop: 4 }}>
        <summary>What gets sent, and what's kept?</summary>
        <p className="muted">
          Only messages that contain your trigger words leave the phone, and only to this site. Messages without an amount, OTPs,
          reminders and "money received" alerts are thrown away immediately and never stored. Spends are stored privately and
          behind your passcode.
        </p>
      </details>
      <details className="small" style={{ marginTop: 10 }}>
        <summary>Not working?</summary>
        <ul className="muted" style={{ paddingLeft: 18 }}>
          <li>Tap <strong>Test link</strong> above. If it fails, copy the link again (it changes if you create a new link under Security).</li>
          <li>Make sure the automation is set to <strong>Run Immediately</strong>, not <em>Run After Confirmation</em>.</li>
          <li>Check that the <code>text</code> field is set to <em>Shortcut Input → Content</em>, not left empty.</li>
          <li>Paste the bank SMS into <strong>Add messages manually</strong> below to check the amount and merchant are read correctly.</li>
        </ul>
      </details>
      <details className="small" style={{ marginTop: 10 }}>
        <summary>Put this app on your Home Screen</summary>
        <p className="muted">
          In Safari, tap the Share button → <strong>Add to Home Screen</strong>. It opens full-screen like an app, and new transactions pop up as soon as you open it.
        </p>
      </details>
    </div>
  );
}

export { Copy };

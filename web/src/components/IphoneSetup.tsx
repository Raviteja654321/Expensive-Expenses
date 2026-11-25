import { useState } from "react";

export function siteUrl(): string {
  return `${location.origin}${location.pathname}`;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
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

function CopyLine({ value }: { value: string }) {
  return (
    <div className="copybox">
      <code>{value}</code>
      <CopyButton text={value} />
    </div>
  );
}

export function IphoneSetup() {
  const [mode, setMode] = useState<"quiet" | "instant">("quiet");
  const site = siteUrl();
  const sample = "Rs 1.00 debited from A/c XX0000 to TEST MERCHANT. This is a test from the setup page.";

  return (
    <div className="setup">
      <p className="small muted" style={{ marginTop: 0 }}>
        iOS doesn't let websites read your Messages. A <strong>Shortcuts automation</strong> passes each bank SMS to this page
        instead. It's free, built into iOS, and the messages never touch a server: they go straight from your Messages to this
        page on your phone.
      </p>

      <div className="seg" role="group" aria-label="Setup style">
        <button aria-pressed={mode === "quiet"} onClick={() => setMode("quiet")}>Collect, review later</button>
        <button aria-pressed={mode === "instant"} onClick={() => setMode("instant")}>Pop up right away</button>
      </div>

      {mode === "quiet" ? (
        <>
          <p className="small muted">
            Bank SMS are saved quietly to a file. Tap a <strong>Review Expenses</strong> icon on your Home Screen whenever you like,
            and everything since last time pops up here, one by one. <span className="tag">Recommended</span>
          </p>
          <h3>Part 1 · Automation that saves each bank SMS</h3>
          <ol className="steps">
            <li>Open <strong>Shortcuts</strong> → <strong>Automation</strong> → <kbd>+</kbd> → <strong>Message</strong>.</li>
            <li>
              <strong>Message Contains</strong>: <code>debited</code>. Choose <strong>Run Immediately</strong> → <strong>Next</strong> →{" "}
              <strong>New Blank Automation</strong>.
            </li>
            <li>
              Add action <strong>Text</strong>. Type <code>###</code> and a space. Then from the variable bar insert <strong>Current Date</strong>,
              tap it, and set <em>Date Format</em> to <strong>ISO 8601</strong> (turn on <em>Include Time</em>). Press return to start a new line, insert{" "}
              <strong>Shortcut Input</strong>, tap it and choose <strong>Content</strong>.
            </li>
            <li>
              Add action <strong>Append to Text File</strong>. Append the <em>Text</em> to file <code>expenses-inbox.txt</code> in the{" "}
              <strong>Shortcuts</strong> folder, with <strong>Make New Line</strong> on.
            </li>
            <li>
              Tap <strong>Done</strong>. Make the same automation for <code>spent</code> and <code>Sent Rs</code> too (and any word your bank uses).
              A message caught twice is only counted once.
            </li>
          </ol>
          <h3>Part 2 · The “Review Expenses” shortcut</h3>
          <ol className="steps">
            <li>In the <strong>Shortcuts</strong> tab tap <kbd>+</kbd> and name it <strong>Review Expenses</strong>.</li>
            <li>
              <strong>Get File from Folder</strong>: folder <strong>Shortcuts</strong>, path <code>expenses-inbox.txt</code>. Turn off{" "}
              <em>Error If Not Found</em>.
            </li>
            <li><strong>URL Encode</strong> the <em>File</em>.</li>
            <li>
              <strong>Text</strong>: paste this, then insert <strong>URL Encoded Text</strong> right after it:
              <CopyLine value={`${site}#inbox=`} />
            </li>
            <li><strong>Open URLs</strong> with that <em>Text</em>.</li>
            <li><strong>Delete Files</strong>: the <em>File</em> from step 2, with <em>Confirm Before Deleting</em> off.</li>
            <li>Tap the shortcut's name → <strong>Add to Home Screen</strong>. Use this icon to open the app from now on: it brings in new messages first.</li>
          </ol>
        </>
      ) : (
        <>
          <p className="small muted">The moment a bank SMS arrives, Safari opens this page with that transaction ready to sort. Quicker to set up, but it pops up every time.</p>
          <ol className="steps">
            <li>Open <strong>Shortcuts</strong> → <strong>Automation</strong> → <kbd>+</kbd> → <strong>Message</strong>.</li>
            <li>
              <strong>Message Contains</strong>: <code>debited</code>. Choose <strong>Run Immediately</strong> → <strong>Next</strong> →{" "}
              <strong>New Blank Automation</strong>.
            </li>
            <li>Add <strong>URL Encode</strong>. Tap its input → <strong>Shortcut Input</strong> → tap it again → <strong>Content</strong>.</li>
            <li>
              Add <strong>Text</strong>: paste this, then insert <strong>URL Encoded Text</strong> right after it:
              <CopyLine value={`${site}#add=`} />
            </li>
            <li>Add <strong>Open URLs</strong> with that <em>Text</em>. Tap <strong>Done</strong>.</li>
            <li>Repeat for <code>spent</code> and <code>Sent Rs</code>.</li>
          </ol>
        </>
      )}

      <div className="callout">
        <strong>Important</strong>
        <ul>
          <li>
            Use this page in <strong>Safari</strong>: your data lives in Safari on this phone, and the shortcut opens Safari. You can also add
            this page to your Home Screen (Share → <strong>Add to Home Screen</strong>). It opens in Safari with the same data.
          </li>
          <li>Safari may clear website data you haven't opened for a while. <strong>Save a backup</strong> now and then (below).</li>
        </ul>
      </div>

      <div className="row wrap" style={{ marginTop: 12 }}>
        <a className="btn" href={`${site}#add=${encodeURIComponent(sample)}`}>
          🧪 Test the hand-off
        </a>
        <span className="small muted">Adds a ₹1 test transaction the same way your iPhone will.</span>
      </div>

      <details className="small" style={{ marginTop: 14 }}>
        <summary>Sharing with friends</summary>
        <p className="muted">
          Send them this page's link. Everyone's data stays on their own phone, so there are no accounts and no one sees anyone else's
          spending. To save them time, build the <em>Review Expenses</em> shortcut once, then in Shortcuts long-press it →{" "}
          <strong>Share</strong> → <strong>Copy iCloud Link</strong> and send that too. They tap it, then tap <strong>Add Shortcut</strong>.
          Automations can't be shared, so each friend makes their own (Part 1).
        </p>
      </details>
      <details className="small" style={{ marginTop: 10 }}>
        <summary>Not working?</summary>
        <ul className="muted">
          <li>The automation must be set to <strong>Run Immediately</strong>.</li>
          <li>The first run may ask to allow access to the file or to open Safari. Choose <strong>Always Allow</strong>.</li>
          <li>Check the <em>Text</em> action uses <em>Shortcut Input → Content</em>, not the whole message.</li>
          <li>You can always copy a bank SMS and use <strong>Paste from clipboard</strong> below.</li>
        </ul>
      </details>
    </div>
  );
}

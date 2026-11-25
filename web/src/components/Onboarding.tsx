import { useState } from "react";
import { createProfile } from "../lib/actions";
import { useStore } from "../store";
import { requestPersistence } from "../db";

const guessCurrency = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (/Kolkata|Calcutta/.test(tz)) return "INR";
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage)|^US\//.test(tz)) return "USD";
    if (/London/.test(tz)) return "GBP";
    if (/Dubai/.test(tz)) return "AED";
    if (/Singapore/.test(tz)) return "SGD";
  } catch {
    /* ignore */
  }
  return "INR";
};

export function Onboarding() {
  const { apply } = useStore();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(guessCurrency);

  return (
    <div className="onboard">
      <div className="onboard-hero">
        <img src="./icon.svg" alt="" className="onboard-logo" />
        <h1>Expensive Expenses</h1>
        <p>Your bank SMS, sorted into categories, budgets and charts, with friends' splits tracked.</p>
      </div>
      <ul className="onboard-points">
        <li><span>📬</span><div><strong>Every spend pops up</strong><small>Open the app and sort new transactions in a tap: just me, or split with friends.</small></div></li>
        <li><span>📊</span><div><strong>See where it goes</strong><small>Trends, categories, a spending calendar, budgets and smart tips.</small></div></li>
        <li><span>🔒</span><div><strong>Private by design</strong><small>No account. Everything stays on this phone.</small></div></li>
      </ul>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          apply((d) => createProfile(d, { name, currency }));
          void requestPersistence();
        }}
      >
        <div>
          <label className="field" htmlFor="oname">What should we call you?</label>
          <input id="oname" className="input" placeholder="Your first name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="spread">
          <label className="field" htmlFor="ocur" style={{ margin: 0 }}>Currency</label>
          <select id="ocur" className="input" style={{ width: 110 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["INR", "USD", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <button className="btn primary block big-btn">Get started →</button>
      </form>
    </div>
  );
}

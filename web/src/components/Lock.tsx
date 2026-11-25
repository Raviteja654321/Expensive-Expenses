import { useState } from "react";
import { api, setToken } from "../api";

export function Lock({ mode, onUnlocked }: { mode: "setup" | "login"; onUnlocked: () => void }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "setup" && pass !== confirm) return setError("The two passcodes don't match.");
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>(mode === "setup" ? "/setup" : "/login", { body: { passcode: pass } });
      setToken(token);
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="lock" onSubmit={submit}>
      <img className="logo" src="/icon.svg" alt="" />
      <h1>Expensive Expenses</h1>
      <p className="muted">
        {mode === "setup"
          ? "Welcome! Create a passcode to keep your transactions private. You'll use it to unlock this app on each device."
          : "Enter your passcode to unlock."}
      </p>
      <div className="stack" style={{ marginTop: 12 }}>
        <input
          className="input"
          type="password"
          placeholder={mode === "setup" ? "New passcode (4+ characters)" : "Passcode"}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoFocus
          autoComplete={mode === "setup" ? "new-password" : "current-password"}
          aria-label="Passcode"
        />
        {mode === "setup" && (
          <input
            className="input"
            type="password"
            placeholder="Repeat passcode"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            aria-label="Repeat passcode"
          />
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn primary block" disabled={busy || pass.length < 4}>
          {busy ? "…" : mode === "setup" ? "Create passcode" : "Unlock"}
        </button>
      </div>
    </form>
  );
}

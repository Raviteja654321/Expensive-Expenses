import { useCallback, useEffect, useRef, useState } from "react";
import type { Transaction } from "../../shared/types";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import { AppProvider, useApp } from "./context";
import { Categories } from "./components/Categories";
import { Dashboard } from "./components/Dashboard";
import { Lock } from "./components/Lock";
import { ReviewQueue } from "./components/ReviewQueue";
import { SettingsPage } from "./components/Settings";

type Tab = "home" | "categories" | "settings";
const TITLES: Record<Tab, string> = { home: "Expenses", categories: "Categories", settings: "Settings" };

const tabFromHash = (): Tab => {
  const h = location.hash.replace(/^#\/?/, "");
  return h === "categories" || h === "settings" ? h : "home";
};

function Main({ onLock }: { onLock: () => void }) {
  const { settings } = useApp();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [pending, setPending] = useState<Transaction[]>([]);
  const [reviewing, setReviewing] = useState<Transaction[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastCount = useRef<number | null>(null);
  const reviewingRef = useRef(false);
  reviewingRef.current = reviewing !== null;

  const loadPending = useCallback(async (autoOpen: boolean) => {
    try {
      const list = await api<Transaction[]>("/pending");
      setPending(list);
      // New transactions pop up on their own when you open (or come back to) the app.
      const grew = lastCount.current === null ? list.length > 0 : list.length > lastCount.current;
      if (autoOpen && grew && !reviewingRef.current) setReviewing(list);
      lastCount.current = list.length;
    } catch {
      /* offline or locked; the next refresh will retry */
    }
  }, []);

  useEffect(() => {
    void loadPending(true);
    const onVisible = () => document.visibilityState === "visible" && void loadPending(true);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => document.visibilityState === "visible" && void loadPending(true), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [loadPending]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (t: Tab) => {
    location.hash = t === "home" ? "" : `/${t}`;
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  const changed = () => {
    setRefreshKey((k) => k + 1);
    void loadPending(false);
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>{TITLES[tab]}</h1>
        {tab === "home" && pending.length > 0 && (
          <button className="btn sm primary" onClick={() => setReviewing(pending)}>
            Review {pending.length}
          </button>
        )}
      </header>

      {tab === "home" && settings && (
        <Dashboard pendingCount={pending.length} onReview={() => setReviewing(pending)} refreshKey={refreshKey} onChanged={changed} />
      )}
      {tab === "categories" && <Categories />}
      {tab === "settings" && (
        <SettingsPage
          onLock={onLock}
          onMessagesAdded={() => {
            void loadPending(false);
          }}
        />
      )}

      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          <button className="tab" aria-current={tab === "home" ? "page" : undefined} onClick={() => go("home")}>
            <span className="ico" aria-hidden>🏠</span>Home
            {pending.length > 0 && <span className="badge">{pending.length}</span>}
          </button>
          <button className="tab" aria-current={tab === "categories" ? "page" : undefined} onClick={() => go("categories")}>
            <span className="ico" aria-hidden>🏷️</span>Categories
          </button>
          <button className="tab" aria-current={tab === "settings" ? "page" : undefined} onClick={() => go("settings")}>
            <span className="ico" aria-hidden>⚙️</span>Settings
          </button>
        </div>
      </nav>

      {reviewing && (
        <ReviewQueue
          items={reviewing}
          onClose={() => {
            setReviewing(null);
            changed();
          }}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

export function App() {
  const [state, setState] = useState<"loading" | "setup" | "login" | "ready" | "error">("loading");

  const check = useCallback(async () => {
    try {
      const s = await api<{ setup_done: boolean; authed: boolean }>("/status");
      setState(!s.setup_done ? "setup" : s.authed && getToken() ? "ready" : "login");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setState("login");
    });
    void check();
  }, [check]);

  const lock = async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setState("login");
  };

  if (state === "loading") return <div className="lock"><p className="muted">Loading…</p></div>;
  if (state === "error")
    return (
      <div className="lock">
        <p className="muted">Can't reach the server.</p>
        <button className="btn primary" onClick={() => void check()}>Try again</button>
      </div>
    );
  if (state === "setup" || state === "login") return <Lock mode={state} onUnlocked={() => setState("ready")} />;
  return (
    <AppProvider>
      <Main onLock={() => void lock()} />
    </AppProvider>
  );
}

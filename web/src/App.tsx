import { useCallback, useEffect, useRef, useState } from "react";
import type { Transaction } from "../../shared/types";
import { StoreProvider, useStore } from "./store";
import { Onboarding } from "./components/Onboarding";
import { ReviewQueue } from "./components/ReviewQueue";
import { QuickAdd } from "./components/QuickAdd";
import { Home } from "./pages/Home";
import { Insights, type InsightView } from "./pages/Insights";
import { Activity } from "./pages/Activity";
import { CategoriesPage } from "./pages/CategoriesPage";
import { SettingsPage } from "./pages/SettingsPage";

type Tab = "home" | "insights" | "activity" | "categories" | "settings";
export type Nav = (tab: Tab, view?: InsightView) => void;

const TABS: { key: Tab; label: string; icon: string; title: string }[] = [
  { key: "home", label: "Home", icon: "🏠", title: "Overview" },
  { key: "insights", label: "Insights", icon: "📊", title: "Insights" },
  { key: "activity", label: "Activity", icon: "🧾", title: "Activity" },
  { key: "categories", label: "Budgets", icon: "🏷️", title: "Categories" },
  { key: "settings", label: "Settings", icon: "⚙️", title: "Settings" },
];
const VIEWS: InsightView[] = ["trends", "categories", "calendar", "merchants", "friends", "tips"];

function parseHash(): { tab: Tab; view: InsightView } {
  const [t, v] = location.hash.replace(/^#\/?/, "").split("/");
  const tab = (TABS.some((x) => x.key === t) ? t : "home") as Tab;
  const view = (VIEWS.includes(v as InsightView) ? v : "trends") as InsightView;
  return { tab, view };
}

function Main() {
  const { data, pending, arrived, clearArrived, toast } = useStore();
  const [{ tab, view }, setRoute] = useState(parseHash);
  const [reviewing, setReviewing] = useState<Transaction[] | null>(null);
  // Bumped to ask for the review pop-ups; the effect reads `pending` after the data has updated.
  const [reviewRequest, setReviewRequest] = useState(0);
  const requestReview = useCallback(() => setReviewRequest((n) => n + 1), []);
  const autoOpened = useRef(false);
  const [quick, setQuick] = useState<{ via: string | null } | null>(null);

  // "#quick" (from a GPay / PhonePe "app closed" automation) opens the add form.
  useEffect(() => {
    const check = () => {
      const m = /^#quick(?:=([^&]*))?/.exec(location.hash);
      if (!m) return;
      history.replaceState(null, "", location.pathname);
      let via: string | null = null;
      try {
        via = m[1] ? decodeURIComponent(m[1]) : null;
      } catch {
        via = m[1] ?? null;
      }
      setQuick({ via });
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);

  useEffect(() => {
    if (reviewRequest > 0) setReviewing((cur) => cur ?? (pending.length ? pending : null));
  }, [reviewRequest]);

  // Pop-ups open by themselves when you open the app and something is waiting.
  useEffect(() => {
    if (!autoOpened.current && pending.length > 0) {
      autoOpened.current = true;
      requestReview();
    }
  }, [pending.length, requestReview]);

  // Messages handed over by the iPhone Shortcut.
  useEffect(() => {
    if (!arrived) return;
    const n = arrived.filter((r) => r.status === "queued").length;
    const skipped = arrived.length - n;
    clearArrived();
    if (n > 0) requestReview();
    else toast(skipped ? `Nothing new (${skipped} message${skipped > 1 ? "s" : ""} skipped or already added)` : "No new messages");
  }, [arrived, clearArrived, requestReview, toast]);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav: Nav = useCallback((t, v) => {
    const hash = t === "home" ? "" : t === "insights" ? `#/insights/${v ?? "trends"}` : `#/${t}`;
    history.pushState(null, "", `${location.pathname}${hash}`);
    setRoute({ tab: t, view: v ?? "trends" });
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parseHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openReview = requestReview;
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="app">
      <header className="topbar">
        <h1>{tab === "home" ? `Hi${data.profile?.name ? `, ${data.profile.name}` : ""}` : current.title}</h1>
        <div className="row">
          {pending.length > 0 && (
            <button className="btn sm" onClick={openReview}>Review {pending.length}</button>
          )}
          <button className="btn sm primary" onClick={() => setQuick({ via: null })} aria-label="Add an expense">＋ Add</button>
        </div>
      </header>

      {tab === "home" && <Home onReview={openReview} nav={nav} />}
      {tab === "insights" && <Insights view={view} setView={(v) => nav("insights", v)} />}
      {tab === "activity" && <Activity onReview={openReview} />}
      {tab === "categories" && <CategoriesPage />}
      {tab === "settings" && <SettingsPage onQueued={requestReview} />}

      <nav className="tabbar" aria-label="Main">
        <div className="tabbar-inner">
          {TABS.map((t) => (
            <button key={t.key} className="tab" aria-current={tab === t.key ? "page" : undefined} onClick={() => nav(t.key, t.key === "insights" ? view : undefined)}>
              <span className="ico" aria-hidden>{t.icon}</span>
              {t.label}
              {t.key === "home" && pending.length > 0 && <span className="badge">{pending.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      {reviewing && <ReviewQueue items={reviewing} onClose={() => setReviewing(null)} />}
      {quick && (
        <QuickAdd
          via={quick.via}
          onClose={() => setQuick(null)}
          onAdded={(t) => {
            setQuick(null);
            setReviewing([t]);
          }}
        />
      )}
    </div>
  );
}

function Gate() {
  const { ready, data } = useStore();
  if (!ready) return <div className="splash"><img src="./icon.svg" alt="" /></div>;
  if (!data.profile) return <Onboarding />;
  return <Main />;
}

export function App() {
  return (
    <StoreProvider>
      <Gate />
    </StoreProvider>
  );
}

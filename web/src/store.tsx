import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppData, Category, Transaction, TxnSource } from "../../shared/types";
import { emptyData, ingestMessages, readInboxFromUrl, splitInbox, type IngestEntry, type IngestResult } from "./lib/actions";
import { clearData, loadData, requestPersistence, saveData } from "./db";

interface Store {
  ready: boolean;
  data: AppData;
  currency: string;
  categories: Category[];
  pending: Transaction[];
  /** Apply a pure update (from lib/actions). Throws on validation errors so callers can show them. */
  apply: (fn: (d: AppData) => AppData) => void;
  ingest: (entries: IngestEntry[], source: TxnSource) => IngestResult[];
  /** Messages that arrived through the link (from the iPhone Shortcut) on this page load. */
  arrived: IngestResult[] | null;
  clearArrived: () => void;
  replaceAll: (d: AppData) => void;
  eraseAll: () => Promise<void>;
  persisted: boolean | null;
  toast: (msg: string) => void;
}

const Ctx = createContext<Store | null>(null);
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ee-sync") : null;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [arrived, setArrived] = useState<IngestResult[] | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const ref = useRef<AppData>(data);
  const saveTimer = useRef<number | undefined>(undefined);
  const toastTimer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    if (!dirty.current) return;
    dirty.current = false;
    await saveData(ref.current);
    channel?.postMessage("saved");
  }, []);

  const commit = useCallback(
    (next: AppData) => {
      ref.current = next;
      setData(next);
      dirty.current = true;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void flush(), 120);
    },
    [flush],
  );

  const apply = useCallback((fn: (d: AppData) => AppData) => commit(fn(ref.current)), [commit]);

  const ingest = useCallback(
    (entries: IngestEntry[], source: TxnSource) => {
      const r = ingestMessages(ref.current, entries, source);
      if (r.data !== ref.current) commit(r.data);
      return r.results;
    },
    [commit],
  );

  const reloadFromDisk = useCallback(async () => {
    if (dirty.current) return;
    const d = await loadData();
    if (d) {
      ref.current = d;
      setData(d);
    }
  }, []);

  // First load + import whatever the iPhone Shortcut put in the link.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = (await loadData()) ?? emptyData();
      if (cancelled) return;
      ref.current = stored;
      setData(stored);
      const inbox = readInboxFromUrl(location.hash, location.search);
      if (inbox !== null) {
        history.replaceState(null, "", location.pathname);
        if (stored.profile) {
          const results = ingest(splitInbox(inbox), "shortcut");
          setArrived(results);
          await flush();
        } else {
          // Not set up yet: keep the messages until onboarding finishes.
          sessionStorage.setItem("ee-pending-inbox", inbox);
        }
      }
      setReady(true);
      if (stored.profile) setPersisted(await requestPersistence());
    })();
    return () => {
      cancelled = true;
    };
  }, [ingest, flush]);

  // After onboarding, import messages that arrived before setup.
  useEffect(() => {
    if (!ready || !data.profile) return;
    const held = sessionStorage.getItem("ee-pending-inbox");
    if (held) {
      sessionStorage.removeItem("ee-pending-inbox");
      setArrived(ingest(splitInbox(held), "shortcut"));
      void requestPersistence().then(setPersisted);
    }
  }, [ready, data.profile, ingest]);

  // A Shortcut can also open the page while it's already open: then only the hash changes.
  useEffect(() => {
    if (!ready) return;
    const onHash = () => {
      const inbox = readInboxFromUrl(location.hash, location.search);
      if (inbox === null) return;
      history.replaceState(null, "", location.pathname);
      if (!ref.current.profile) {
        sessionStorage.setItem("ee-pending-inbox", inbox);
        return;
      }
      setArrived(ingest(splitInbox(inbox), "shortcut"));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [ready, ingest]);

  // Keep several open tabs (Safari opens one per Shortcut run) in sync.
  useEffect(() => {
    const onMsg = () => void reloadFromDisk();
    channel?.addEventListener("message", onMsg);
    const onVis = () => {
      if (document.visibilityState === "visible") void reloadFromDisk();
      else void flush();
    };
    const onHide = () => void flush();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      channel?.removeEventListener("message", onMsg);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [reloadFromDisk, flush]);

  // Theme
  useEffect(() => {
    const t = data.profile?.theme ?? "auto";
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [data.profile?.theme]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const replaceAll = useCallback((d: AppData) => commit(d), [commit]);
  const clearArrived = useCallback(() => setArrived(null), []);
  const eraseAll = useCallback(async () => {
    dirty.current = false;
    window.clearTimeout(saveTimer.current);
    await clearData();
    ref.current = emptyData();
    setData(ref.current);
    channel?.postMessage("saved");
  }, []);

  const categories = useMemo(() => [...data.categories].sort((a, b) => a.sort - b.sort), [data.categories]);
  const pending = useMemo(
    () => data.transactions.filter((t) => t.status === "pending").sort((a, b) => a.received_at.localeCompare(b.received_at)),
    [data.transactions],
  );

  const value: Store = {
    ready,
    data,
    currency: data.profile?.currency ?? "INR",
    categories,
    pending,
    apply,
    ingest,
    arrived,
    clearArrived,
    replaceAll,
    eraseAll,
    persisted,
    toast,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </Ctx.Provider>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Category, Settings, SplitwiseMeta } from "../../shared/types";
import { api } from "./api";

interface AppCtx {
  categories: Category[];
  settings: Settings | null;
  people: string[];
  splitwise: SplitwiseMeta | null;
  reloadCategories: () => Promise<void>;
  reloadSettings: () => Promise<void>;
  reloadPeople: () => Promise<void>;
  loadSplitwise: (force?: boolean) => Promise<SplitwiseMeta | null>;
  addCategory: (name: string, emoji: string) => Promise<Category>;
  toast: (msg: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [splitwise, setSplitwise] = useState<SplitwiseMeta | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const reloadCategories = useCallback(async () => setCategories(await api<Category[]>("/categories")), []);
  const reloadSettings = useCallback(async () => setSettings(await api<Settings>("/settings")), []);
  const reloadPeople = useCallback(async () => setPeople(await api<string[]>("/people")), []);
  const loadSplitwise = useCallback(async (force = false) => {
    if (splitwise && !force) return splitwise;
    const meta = await api<SplitwiseMeta>("/splitwise");
    setSplitwise(meta);
    return meta;
  }, [splitwise]);

  const addCategory = useCallback(async (name: string, emoji: string) => {
    const c = await api<Category>("/categories", { body: { name, emoji } });
    setCategories((prev) => [...prev, c]);
    return c;
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 2600);
  }, []);

  useEffect(() => {
    void Promise.all([reloadCategories(), reloadSettings(), reloadPeople()]).catch(() => {});
  }, [reloadCategories, reloadSettings, reloadPeople]);

  return (
    <Ctx.Provider
      value={{ categories, settings, people, splitwise, reloadCategories, reloadSettings, reloadPeople, loadSplitwise, addCategory, toast }}
    >
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </Ctx.Provider>
  );
}

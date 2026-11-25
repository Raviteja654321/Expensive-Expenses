import { useState } from "react";
import type { Category } from "../../../shared/types";
import { api } from "../api";
import { useApp } from "../context";

function CategoryRow({ c, index, count, onMove }: { c: Category; index: number; count: number; onMove: (from: number, to: number) => void }) {
  const { reloadCategories, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [emoji, setEmoji] = useState(c.emoji);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/categories/${c.id}`, { method: "PATCH", body: { name, emoji } });
      await reloadCategories();
      setEditing(false);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete “${c.name}”? Expenses in it become Uncategorized.`)) return;
    setBusy(true);
    try {
      await api(`/categories/${c.id}`, { method: "DELETE" });
      await reloadCategories();
      toast(`Deleted “${c.name}”`);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="cat-row" style={{ flexWrap: "wrap" }}>
        <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
        <input
          className="input grow"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          aria-label="Category name"
          maxLength={40}
          autoFocus
        />
        <div className="row" style={{ width: "100%", justifyContent: "space-between" }}>
          <button className="btn sm danger" onClick={() => void remove()} disabled={busy}>Delete</button>
          <div className="row">
            <button className="btn sm" onClick={() => { setEditing(false); setName(c.name); setEmoji(c.emoji); }}>Cancel</button>
            <button className="btn sm primary" onClick={() => void save()} disabled={busy || !name.trim()}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cat-row">
      <div className="order">
        <button onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={`Move ${c.name} up`}>▲</button>
        <button onClick={() => onMove(index, index + 1)} disabled={index === count - 1} aria-label={`Move ${c.name} down`}>▼</button>
      </div>
      <button className="emoji-btn" onClick={() => setEditing(true)} aria-label={`Edit ${c.name}`}>{c.emoji || "🏷️"}</button>
      <span className="grow" style={{ fontWeight: 600 }}>{c.name}</span>
      <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
    </div>
  );
}

export function Categories() {
  const { categories, addCategory, reloadCategories, toast } = useApp();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏷️");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addCategory(name.trim(), emoji.trim() || "🏷️");
      setName("");
      setEmoji("🏷️");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= categories.length) return;
    const ids = categories.map((c) => c.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    try {
      await api("/categories/reorder", { body: { ids } });
      await reloadCategories();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Add a category</h2>
        <div className="row">
          <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
          <input
            className="input grow"
            placeholder="e.g. Gifts, Rent, Pets"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            aria-label="Category name"
            maxLength={40}
          />
          <button className="btn primary" onClick={() => void add()} disabled={busy || !name.trim()}>Add</button>
        </div>
      </div>
      <div className="card">
        <h2>Your categories</h2>
        {categories.map((c, i) => (
          <CategoryRow key={c.id + c.name + c.emoji} c={c} index={i} count={categories.length} onMove={(a, b) => void move(a, b)} />
        ))}
        <p className="small muted" style={{ marginBottom: 0 }}>
          The order here is the order in the pop-ups. The app also remembers which category you pick for each merchant and suggests it next time.
        </p>
      </div>
    </>
  );
}

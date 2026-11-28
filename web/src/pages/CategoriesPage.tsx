import { useMemo, useState } from "react";
import { COLOR_KEYS, type Category, type ColorKey } from "../../../shared/types";
import { useStore } from "../store";
import { addCategory, deleteCategory, reorderCategories, updateCategory, ValidationError } from "../lib/actions";
import { money, monthKey } from "../lib/format";
import { byCategory, expenses, inMonth, monthBounds } from "../lib/stats";
import { Meter } from "../components/charts/Meter";

function ColorPicker({ value, onChange }: { value: ColorKey; onChange: (c: ColorKey) => void }) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Colour">
      {COLOR_KEYS.map((k) => (
        <button key={k} role="radio" aria-checked={value === k} aria-label={k} className="color-dot" style={{ background: `var(--c-${k})` }} onClick={() => onChange(k)} />
      ))}
    </div>
  );
}

function Row({ c, index, count, spent, onMove }: { c: Category; index: number; count: number; spent: number; onMove: (a: number, b: number) => void }) {
  const { apply, toast, currency } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [emoji, setEmoji] = useState(c.emoji);
  const [color, setColor] = useState<ColorKey>(c.color);
  const [budget, setBudget] = useState(c.budget ? String(c.budget) : "");
  const key = monthKey();
  const pace = new Date().getDate() / monthBounds(key).days;

  function save() {
    try {
      const b = budget.trim() ? Number(budget) : null;
      apply((d) => updateCategory(d, c.id, { name, emoji: emoji.trim() || "🏷️", color, budget: b }));
      setEditing(false);
    } catch (e) {
      toast(e instanceof ValidationError ? e.message : "Couldn't save.");
    }
  }

  function remove() {
    if (!confirm(`Delete “${c.name}”? Its expenses become Uncategorized.`)) return;
    apply((d) => deleteCategory(d, c.id));
    toast(`Deleted “${c.name}”`);
  }

  if (editing) {
    return (
      <div className="cat-edit">
        <div className="row">
          <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" maxLength={40} autoFocus />
        </div>
        <label className="field">Colour (used in charts)</label>
        <ColorPicker value={color} onChange={setColor} />
        <label className="field" htmlFor={`b-${c.id}`}>Monthly budget (optional)</label>
        <input id={`b-${c.id}`} className="input" inputMode="decimal" placeholder="No budget" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} />
        <div className="spread">
          <button className="btn sm danger" onClick={remove}>Delete</button>
          <div className="row">
            <button className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn sm primary" onClick={save} disabled={!name.trim()}>Save</button>
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
      <button className="emoji-btn" style={{ background: `color-mix(in srgb, var(--c-${c.color}) 20%, var(--surface))` }} onClick={() => setEditing(true)} aria-label={`Edit ${c.name}`}>
        {c.emoji || "🏷️"}
      </button>
      <div className="grow">
        <div className="spread">
          <strong>{c.name}</strong>
          <span className="small tnum">{money(spent, currency)}{c.budget ? <span className="muted"> / {money(c.budget, currency)}</span> : null}</span>
        </div>
        {c.budget ? <Meter value={spent} max={c.budget} pace={pace} /> : <div className="small muted">No budget · this month</div>}
      </div>
      <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
    </div>
  );
}

export function CategoriesPage() {
  const { data, categories, currency, apply, toast } = useStore();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏷️");
  const spent = useMemo(() => {
    const key = monthKey();
    const month = expenses(data.transactions, currency).filter((t) => inMonth(t, key));
    return new Map(byCategory(month, categories).map((c) => [c.id, c.total]));
  }, [data.transactions, categories, currency]);
  const totalBudget = categories.reduce((a, c) => a + (c.budget ?? 0), 0);

  function add() {
    try {
      apply((d) => addCategory(d, { name, emoji }).data);
      toast(`Added “${name.trim()}”`);
      setName("");
      setEmoji("🏷️");
    } catch (e) {
      toast(e instanceof ValidationError ? e.message : "Couldn't add that.");
    }
  }

  function move(a: number, b: number) {
    if (b < 0 || b >= categories.length) return;
    const ids = categories.map((c) => c.id);
    const [id] = ids.splice(a, 1);
    ids.splice(b, 0, id);
    apply((d) => reorderCategories(d, ids));
  }

  return (
    <>
      <div className="card">
        <h2>Add a category</h2>
        <div className="row">
          <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
          <input className="input grow" placeholder="e.g. Gifts, Rent, Pets" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="Category name" maxLength={40} />
          <button className="btn primary" onClick={add} disabled={!name.trim()}>Add</button>
        </div>
      </div>
      <div className="card">
        <div className="spread">
          <h2>Categories & budgets</h2>
          {totalBudget > 0 && <span className="small muted">Total {money(totalBudget, currency)}/mo</span>}
        </div>
        {categories.map((c, i) => (
          <Row key={`${c.id}-${c.name}-${c.emoji}-${c.color}-${c.budget}`} c={c} index={i} count={categories.length} spent={spent.get(c.id) ?? 0} onMove={move} />
        ))}
        <p className="small muted" style={{ marginBottom: 0 }}>
          Tap a category to rename it, change its emoji or colour, or set a monthly budget. The order here is the order in the pop-ups.
        </p>
      </div>
    </>
  );
}

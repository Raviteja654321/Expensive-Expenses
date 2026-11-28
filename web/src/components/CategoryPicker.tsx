import { useState } from "react";
import { addCategory, ValidationError } from "../lib/actions";
import { useStore } from "../store";

export function CategoryPicker({ value, suggested, onChange }: { value: string | null; suggested?: string | null; onChange: (id: string | null) => void }) {
  const { categories, apply, toast } = useStore();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏷️");

  function add() {
    if (!name.trim()) return;
    try {
      let created = "";
      apply((d) => {
        const r = addCategory(d, { name, emoji });
        created = r.category.id;
        return r.data;
      });
      onChange(created);
      setAdding(false);
      setName("");
      setEmoji("🏷️");
      toast(`Added “${name.trim()}”`);
    } catch (e) {
      toast(e instanceof ValidationError ? e.message : "Couldn't add that category.");
    }
  }

  return (
    <div>
      <div className="chips" role="group" aria-label="Category">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip${c.id === suggested ? " suggested" : ""}`}
            aria-pressed={value === c.id}
            onClick={() => onChange(value === c.id ? null : c.id)}
            title={c.id === suggested ? "Suggested" : undefined}
          >
            <span className="dot" style={{ background: `var(--c-${c.color})` }} aria-hidden />
            <span aria-hidden>{c.emoji}</span>
            {c.name}
          </button>
        ))}
        {!adding && (
          <button type="button" className="chip add" onClick={() => setAdding(true)}>
            ＋ New category
          </button>
        )}
      </div>
      {adding && (
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" maxLength={8} />
          <input
            className="input grow"
            value={name}
            autoFocus
            placeholder="e.g. Gifts"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            aria-label="New category name"
            maxLength={40}
          />
          <button type="button" className="btn primary" disabled={!name.trim()} onClick={add}>Add</button>
          <button type="button" className="iconbtn" onClick={() => setAdding(false)} aria-label="Cancel">✕</button>
        </div>
      )}
    </div>
  );
}

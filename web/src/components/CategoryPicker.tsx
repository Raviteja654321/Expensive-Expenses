import { useState } from "react";
import { useApp } from "../context";

export function CategoryPicker({
  value,
  suggested,
  onChange,
}: {
  value: string | null;
  suggested?: string | null;
  onChange: (id: string | null) => void;
}) {
  const { categories, addCategory, toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🏷️");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await addCategory(name.trim(), emoji.trim() || "🏷️");
      onChange(c.id);
      setAdding(false);
      setName("");
      setEmoji("🏷️");
      toast(`Added “${c.name}”`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
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
          <input
            className="input emoji-input"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            aria-label="Emoji"
            maxLength={8}
          />
          <input
            className="input grow"
            value={name}
            autoFocus
            placeholder="e.g. Gifts"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            aria-label="New category name"
            maxLength={40}
          />
          <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={() => void add()}>
            Add
          </button>
          <button type="button" className="iconbtn" onClick={() => setAdding(false)} aria-label="Cancel">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

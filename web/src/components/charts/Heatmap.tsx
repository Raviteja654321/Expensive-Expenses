import { useState } from "react";

/**
 * Calendar heatmap for one month: one cell per day, Monday-first,
 * shaded on a single-hue ramp (more spend = stronger colour).
 */
export function Heatmap({
  year,
  month, // 1-12
  values,
  format,
  onSelect,
  selected,
}: {
  year: number;
  month: number;
  values: number[];
  format: (n: number) => string;
  onSelect?: (day: number | null) => void;
  selected?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const first = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const max = Math.max(0, ...values);
  const today = new Date();
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  const level = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  const cells: (number | null)[] = [...Array(first).fill(null), ...values.map((_, i) => i + 1)];
  const shown = hover ?? selected ?? null;

  return (
    <div>
      <div className="heatmap" role="grid" aria-label="Spending by day">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="hm-head" aria-hidden>
            {d}
          </div>
        ))}
        {cells.map((day, i) =>
          day == null ? (
            <div key={`e${i}`} />
          ) : (
            <button
              key={day}
              className={`hm-cell l${level(values[day - 1])}${selected === day ? " sel" : ""}${isThisMonth && day > today.getDate() ? " future" : ""}`}
              aria-label={`${day}: ${format(values[day - 1])}`}
              onPointerEnter={() => setHover(day)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect?.(selected === day ? null : day)}
            >
              {day}
            </button>
          ),
        )}
      </div>
      <div className="hm-foot">
        <span className="small muted">
          {shown
            ? `${new Date(year, month - 1, shown).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}: ${format(values[shown - 1])}`
            : "Tap a day to see what you spent"}
        </span>
        <span className="hm-legend small muted" aria-hidden>
          Less
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <i key={l} className={`hm-cell l${l}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

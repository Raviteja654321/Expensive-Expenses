import { monthKey, monthLabel, shiftMonth } from "../lib/format";

export function MonthSwitch({ value, onChange, light = false }: { value: string; onChange: (k: string) => void; light?: boolean }) {
  const isNow = value >= monthKey();
  return (
    <div className={`month-switch${light ? " on-hero" : ""}`}>
      <button onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month">‹</button>
      <span>{monthLabel(value)}</span>
      <button onClick={() => onChange(shiftMonth(value, 1))} disabled={isNow} aria-label="Next month">›</button>
    </div>
  );
}

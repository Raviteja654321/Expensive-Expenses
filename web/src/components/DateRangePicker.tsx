import { PRESETS, presetRange, type DateRange, type Preset } from "../lib/range";

export function DateRangePicker({ value, onChange, earliest }: { value: DateRange; onChange: (r: DateRange) => void; earliest?: string | null }) {
  const pick = (p: Preset) => {
    if (p === "custom") onChange({ ...value, preset: "custom" });
    else onChange(presetRange(p, new Date(), earliest));
  };
  return (
    <div className="range-picker">
      <div className="chips scroll" role="group" aria-label="Date range">
        {PRESETS.map((p) => (
          <button key={p.key} className="chip sm" aria-pressed={value.preset === p.key} onClick={() => pick(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="range-custom">
          <label>
            <span>From</span>
            <input className="input" type="date" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          </label>
          <label>
            <span>To</span>
            <input className="input" type="date" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}

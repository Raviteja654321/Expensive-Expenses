import { useState } from "react";

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string; // CSS colour, e.g. var(--c-blue)
  sub?: string; // extra line for the centre readout, e.g. "12 expenses"
}

/**
 * Pie (donut) chart: each slice is a category's share of the total.
 * Hover or tap a slice (or a legend row) to read it in the centre.
 */
export function DonutChart({
  slices,
  format,
  size = 240,
  centerTitle = "Total",
  active: controlled,
  onActive,
  ariaLabel,
}: {
  slices: Slice[];
  format: (n: number) => string;
  size?: number;
  centerTitle?: string;
  active?: string | null;
  onActive?: (key: string | null) => void;
  ariaLabel: string;
}) {
  const [own, setOwn] = useState<string | null>(null);
  const active = controlled !== undefined ? controlled : own;
  const setActive = (k: string | null) => (onActive ? onActive(k) : setOwn(k));
  const total = slices.reduce((s, x) => s + x.value, 0);
  const c = size / 2;
  const R = c - 8;
  const r = R * 0.6;
  const shown = slices.filter((s) => s.value > 0);
  const act = shown.find((s) => s.key === active) ?? null;

  let angle = -Math.PI / 2;
  const arcs = shown.map((s) => {
    const sweep = total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    return { s, a0, a1 };
  });

  return (
    <div className="donut" style={{ width: size, height: size }} onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        {total <= 0 && <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke="var(--track)" strokeWidth={R - r} />}
        {arcs.map(({ s, a0, a1 }) => {
          const mid = (a0 + a1) / 2;
          const on = act?.key === s.key;
          const dx = on ? Math.cos(mid) * 6 : 0;
          const dy = on ? Math.sin(mid) * 6 : 0;
          return (
            <path
              key={s.key}
              d={slicePath(c, c, R, r, a0, a1)}
              fill={s.color}
              className={`slice${act && !on ? " dim" : ""}`}
              transform={`translate(${dx} ${dy})`}
              tabIndex={0}
              role="button"
              aria-label={`${s.label}: ${format(s.value)}, ${Math.round((s.value / total) * 100)}%`}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActive(s.key)}
              onPointerDown={() => setActive(act?.key === s.key ? null : s.key)}
              onFocus={() => setActive(s.key)}
            />
          );
        })}
      </svg>
      <div className="donut-center" aria-live="polite">
        {act ? (
          <>
            <span className="donut-label">
              <i style={{ background: act.color }} />
              {act.label}
            </span>
            <strong>{format(act.value)}</strong>
            <span className="donut-sub">
              {Math.round((act.value / total) * 1000) / 10}% of {format(total)}
              {act.sub ? ` · ${act.sub}` : ""}
            </span>
          </>
        ) : (
          <>
            <span className="donut-label">{centerTitle}</span>
            <strong>{format(total)}</strong>
            <span className="donut-sub">Tap a slice for details</span>
          </>
        )}
      </div>
    </div>
  );
}

function slicePath(cx: number, cy: number, R: number, r: number, a0: number, a1: number): string {
  // A full circle can't be one arc: split it in two.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const m = a0 + Math.PI;
    return slicePath(cx, cy, R, r, a0, m) + slicePath(cx, cy, R, r, m, a1);
  }
  const p = (rad: number, a: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
}

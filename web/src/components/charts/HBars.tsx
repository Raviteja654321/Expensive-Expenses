import type { ReactNode } from "react";

export interface HBar {
  key: string;
  label: ReactNode;
  value: number;
  valueText: string;
  sub?: ReactNode;
  /** Optional swatch colour (CSS value) shown before the label for identity. */
  swatch?: string;
  onClick?: () => void;
}

/** Ranked horizontal bars, one hue, largest first. */
export function HBars({ rows, max }: { rows: HBar[]; max?: number }) {
  const m = max ?? Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="top">
              <span className="name">
                {r.swatch && <span className="swatch" style={{ background: r.swatch }} aria-hidden />}
                {r.label}
              </span>
              <span className="val tnum">{r.valueText}</span>
            </div>
            <div className="track" aria-hidden>
              <div className="fill" style={{ width: `${m ? Math.max(1.5, (r.value / m) * 100) : 0}%` }} />
            </div>
            {r.sub && <div className="sub">{r.sub}</div>}
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button className="hbar-btn" onClick={r.onClick}>
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}

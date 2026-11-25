import { useState } from "react";
import { useWidth } from "./useWidth";

export interface Column {
  key: string;
  label: string; // axis label (may be "")
  title: string; // tooltip heading, e.g. "Tue 24 Nov"
  value: number;
  emphasis?: boolean;
}

/** Vertical bars from one baseline. Tap or hover a bar for its value. */
export function ColumnChart({
  data,
  height = 160,
  format,
  formatAxis,
  reference,
  referenceLabel,
  emphasisMode = false,
  ariaLabel,
}: {
  data: Column[];
  height?: number;
  format: (n: number) => string;
  formatAxis: (n: number) => string;
  reference?: number;
  referenceLabel?: string;
  /** Highlight `emphasis` columns in the accent and grey the rest. */
  emphasisMode?: boolean;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const axisW = 44;
  const top = 10;
  const bottom = 22;
  const plotW = Math.max(60, width - axisW);
  const plotH = height - top - bottom;
  const max = Math.max(1, reference ?? 0, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(3, slot - 2));
  const y = (v: number) => top + plotH - (v / nice) * plotH;
  const ticks = [0, nice / 2, nice];

  const a = active != null ? data[active] : null;
  const ax = active != null ? axisW + slot * active + slot / 2 : 0;

  return (
    <div className="chart" ref={ref} onPointerLeave={() => setActive(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={axisW} x2={width} y1={y(t)} y2={y(t)} className="grid" />
            <text x={axisW - 6} y={y(t) + 4} className="axis" textAnchor="end">
              {formatAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = axisW + slot * i + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const cls = emphasisMode ? (d.emphasis ? "bar" : "bar muted-bar") : "bar";
          return (
            <g key={d.key}>
              {h > 0 && <path d={columnPath(x, y(d.value), barW, h)} className={`${cls}${active === i ? " on" : ""}`} />}
              <rect
                x={axisW + slot * i}
                y={top}
                width={slot}
                height={plotH + bottom}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`${d.title}: ${format(d.value)}`}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
              {d.label && (
                <text x={axisW + slot * i + slot / 2} y={height - 6} className="axis" textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        {reference != null && reference > 0 && (
          <g>
            <line x1={axisW} x2={width} y1={y(reference)} y2={y(reference)} className="ref" />
            {referenceLabel && (
              <text x={axisW + 4} y={y(reference) - 5} className="axis ref-label" textAnchor="start">
                {referenceLabel}
              </text>
            )}
          </g>
        )}
      </svg>
      {a && (
        <div className="tip" style={{ left: Math.min(Math.max(ax, 70), width - 70), top: Math.max(0, y(a.value) - 52) }}>
          <strong>{format(a.value)}</strong>
          <span>{a.title}</span>
        </div>
      )}
    </div>
  );
}

/** Rounded 4px at the data end, square at the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

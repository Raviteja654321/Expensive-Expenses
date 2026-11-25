import { COLOR_KEYS, type ColorKey } from "../../../../shared/types";

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: ColorKey;
}

/** Thin part-to-whole bar (8px, no text). The list beside it carries the figures. */
export function SegmentBar({ parts, ariaLabel }: { parts: Segment[]; ariaLabel: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  return (
    <div className="segbar" role="img" aria-label={ariaLabel}>
      {parts
        .filter((p) => p.value > 0)
        // Blocks follow the palette's validated order, so neighbouring colours stay distinguishable.
        .sort((a, b) => COLOR_KEYS.indexOf(a.color) - COLOR_KEYS.indexOf(b.color))
        .map((p) => (
          <span key={p.key} title={`${p.label}: ${Math.round((p.value / total) * 100)}%`} style={{ flexGrow: p.value, background: `var(--c-${p.color})` }} />
        ))}
    </div>
  );
}

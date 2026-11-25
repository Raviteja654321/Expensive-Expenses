/** A ratio against a limit. The fill carries severity; the track is a lighter step of the same ramp. */
export function Meter({ value, max, pace }: { value: number; max: number; pace?: number }) {
  const ratio = max > 0 ? value / max : 0;
  const level = ratio >= 1 ? "danger" : ratio >= 0.85 || (pace != null && ratio > pace + 0.15) ? "warning" : "ok";
  return (
    <div className={`meter ${level}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="meter-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      {pace != null && pace > 0 && pace < 1 && <div className="meter-pace" style={{ left: `${pace * 100}%` }} title="Where you'd be at an even pace" />}
    </div>
  );
}

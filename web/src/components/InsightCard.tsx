import type { Insight } from "../lib/insights";

export function InsightCard({ insight, onOpen }: { insight: Insight; onOpen?: (link: NonNullable<Insight["link"]>) => void }) {
  const clickable = !!(insight.link && onOpen);
  const Tag = clickable ? "button" : "div";
  return (
    <Tag className={`insight ${insight.tone}`} onClick={clickable ? () => onOpen!(insight.link!) : undefined}>
      <span className="insight-icon" aria-hidden>{insight.icon}</span>
      <span className="grow">
        <strong>{insight.title}</strong>
        <span>{insight.body}</span>
      </span>
      {clickable && <span className="chev" aria-hidden>›</span>}
    </Tag>
  );
}

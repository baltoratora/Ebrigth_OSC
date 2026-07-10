export function MarketingEventStatCard({ label, value, subtle }: { label: string; value: number | string; subtle?: string }) {
  return (
    <div className="fa-card p-4">
      <div
        className="fa-mono text-[10px] uppercase text-gold-600"
        style={{ letterSpacing: "0.12em" }}
      >
        {label}
      </div>
      <div className="fa-mono font-semibold text-4xl text-ink-900 mt-1 leading-none">{value}</div>
      {subtle && <div className="fa-mono text-[10px] text-ink-400 mt-1.5">{subtle}</div>}
    </div>
  );
}

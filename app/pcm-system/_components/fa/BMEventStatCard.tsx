export function BMEventStatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="fa-card p-4">
      <div className="text-xs uppercase tracking-wider font-semibold text-ink-400">{label}</div>
      <div className="fa-display text-3xl text-ink-900 mt-1">{value}</div>
    </div>
  );
}

export function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="fa-mono font-semibold text-2xl text-ink-900 leading-none">{value}</div>
      <div
        className="fa-mono text-[9px] uppercase text-ink-400 mt-1.5"
        style={{ letterSpacing: "0.1em" }}
      >
        {label}
      </div>
    </div>
  );
}

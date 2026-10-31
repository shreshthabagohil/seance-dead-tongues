

interface Props {
  pct: number;        // 0–100
  label?: string;
}

export function ProgressBar({ pct, label = 'Loading model…' }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="progress-wrap" role="status" aria-label={label}>
      <p className="progress-label">{label}</p>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="progress-bar__fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="progress-pct">{clamped}%</p>
    </div>
  );
}

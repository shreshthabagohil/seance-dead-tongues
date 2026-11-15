interface Props {
  reason: string;
  fatal?: boolean;
}

export function CapabilityBanner({ reason, fatal }: Props) {
  return (
    <div className="capability-banner" role="alert" aria-live="assertive">
      <strong>{fatal ? '⚠ Séance cannot begin' : '⚠ Running in Lite Mode'}</strong>
      <p>{reason}</p>
      {fatal && (
        <p>
          WebGPU with shader-f16 support is required for the full experience.
          Try Chrome 113+ or Edge 113+ on a compatible GPU.
        </p>
      )}
    </div>
  );
}

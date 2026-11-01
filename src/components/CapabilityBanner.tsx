interface Props {
  /** Why we're showing this banner (capability probe reason, or an error). */
  reason: string;
  /** true: the whole app is broken (no notes data). false: Lite mode — chat still works. */
  fatal?: boolean;
}

export function CapabilityBanner({ reason, fatal = false }: Props) {
  if (fatal) {
    return (
      <div className="capability-banner capability-banner--fatal" role="alert" aria-live="assertive">
        <strong>⚠ Séance cannot begin</strong>
        <p>{reason}</p>
      </div>
    );
  }

  return (
    <div className="capability-banner capability-banner--lite" role="status" aria-live="polite">
      <strong>🕯 Lite mode</strong>
      <p>
        {reason}. Answering from the notes directly — same facts, no ~711 MB
        model download. Try Chrome 113+ or Edge 113+ on a WebGPU-capable
        device for the full in-character ghost.
      </p>
    </div>
  );
}


import type { CapabilityResult } from '../types';

interface Props {
  cap: CapabilityResult;
}

export function CapabilityBanner({ cap }: Props) {
  if (!cap.blocked) return null;

  return (
    <div className="capability-banner" role="alert" aria-live="assertive">
      <strong>⚠ Séance cannot begin</strong>
      <p>{cap.blocked}</p>
      <p>
        WebGPU with shader-f16 support is required. Try Chrome 113+ or Edge 113+
        on a device with a compatible GPU.
      </p>
    </div>
  );
}

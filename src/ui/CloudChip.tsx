// Whether this device may send a photo to the cloud: one chip that turns cloud checks off, or asks again
// before turning them on. "Paused" when the app's settings have stopped cloud checks for everyone.
export function CloudChip({ consent, paused, onToggle }: { consent: boolean; paused: boolean; onToggle: () => void }) {
  return (
    <button type="button" id="cloud-chip" data-testid="cloud-chip" className="segment cloud-chip" aria-pressed={consent} onClick={onToggle}>
      Cloud: {consent ? (paused ? "paused" : "on") : "off"}
    </button>
  );
}

export type PanelPhase = "notice" | "idle" | "reading" | "verdict" | "error";

export interface PanelState {
  phase: PanelPhase;
  agreed: boolean;
  cloudConsent: boolean | null;
}

export type PanelEvent =
  | { type: "opened"; agreed: boolean; cloudConsent?: boolean | null }
  | { type: "agree" }
  | { type: "cloudConsent"; allowed: boolean }
  | { type: "clear" };

export function initial(): PanelState {
  return { phase: "notice", agreed: false, cloudConsent: null };
}

export function canRead(state: PanelState): boolean {
  return state.agreed;
}

export function canUseCloud(state: PanelState): boolean {
  return canRead(state) && state.cloudConsent === true;
}

export function reduce(state: PanelState, event: PanelEvent): PanelState {
  switch (event.type) {
    case "opened":
      return event.agreed ? { phase: "idle", agreed: true, cloudConsent: event.cloudConsent ?? null } : initial();
    case "agree":
      return { ...state, phase: "idle", agreed: true };
    case "cloudConsent":
      return canRead(state) ? { ...state, cloudConsent: event.allowed } : state;
    case "clear":
      return initial();
  }
}

export type OtaUpdateNotice =
  | { kind: "hidden" }
  | { kind: "downloading"; progressLabel: string | null }
  | { kind: "ready" };

export interface OtaUpdateState {
  isEnabled?: boolean;
  platform?: string;
  isDownloading: boolean;
  isUpdatePending: boolean;
  downloadProgress?: number | null;
}

function formatProgress(progress?: number | null): string | null {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return `${percent}%`;
}

/**
 * Quiet, non-blocking copy for Expo OTA status.
 * Skip the "checking" state so every cold start does not flash a banner.
 */
export function otaUpdateNotice(state: OtaUpdateState): OtaUpdateNotice {
  if (state.platform === "web" || state.isEnabled === false) {
    return { kind: "hidden" };
  }

  if (state.isUpdatePending) {
    return { kind: "ready" };
  }

  if (state.isDownloading) {
    return {
      kind: "downloading",
      progressLabel: formatProgress(state.downloadProgress),
    };
  }

  return { kind: "hidden" };
}

export function otaUpdateMessage(notice: OtaUpdateNotice): string | null {
  if (notice.kind === "downloading") {
    return notice.progressLabel
      ? `Downloading update… ${notice.progressLabel}`
      : "Downloading update…";
  }
  if (notice.kind === "ready") {
    return "Update ready. Tap to restart.";
  }
  return null;
}

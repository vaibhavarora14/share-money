import { Platform } from "react-native";

export type QaProfileGateMode = "off" | "required" | "skippable";

/**
 * Dev-only web QA hook for visual review of the profile gate.
 * Usage: `?qaProfileGate=required` or `?qaProfileGate=skippable`
 */
export function getQaProfileGateMode(): QaProfileGateMode {
  if (typeof __DEV__ === "undefined" || !__DEV__) return "off";
  if (Platform.OS !== "web") return "off";
  if (typeof window === "undefined") return "off";

  try {
    const mode = new URLSearchParams(window.location.search).get(
      "qaProfileGate"
    );
    if (mode === "required" || mode === "skippable") return mode;
  } catch {
    // Ignore malformed URLs.
  }
  return "off";
}

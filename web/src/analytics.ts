import type { PlatformDestination } from "./landingContent";
import { detectDevice } from "./utils/deviceDetection";

export function trackCtaClick(
  destination: PlatformDestination,
  placement: string,
) {
  window.dispatchEvent(
    new CustomEvent("landing_cta_click", {
      detail: {
        platform: destination.platform,
        placement,
        device: detectDevice(),
      },
    }),
  );
}

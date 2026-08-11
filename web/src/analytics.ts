import type { PlatformDestination } from "./landingContent";
import {
  acquisitionContextFromUrl,
  acquisitionContextToProperties,
  buildMigrationHandoffUrl,
  selectFirstTouchAcquisition,
  type AcquisitionContext,
} from "./acquisition";
import { sanitizePostHogProperties } from "./analyticsPrivacy";
import type { SeoPage, SeoTool } from "./seoPages";
import { detectDevice } from "./utils/deviceDetection";

type PostHogClient = typeof import("posthog-js").default;

let analyticsRequested = false;
let analyticsEnabled = false;
let posthogClient: PostHogClient | null = null;
const queuedEvents: Array<{ event: string; properties: Record<string, string> }> = [];
let acquisitionContext: AcquisitionContext | null = null;
let journeyId: string | null = null;
const ACQUISITION_STORAGE_KEY = "sharedmoney_first_touch_v1";
const JOURNEY_STORAGE_KEY = "sharedmoney_journey_v1";

function readStoredAcquisitionContext(): AcquisitionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACQUISITION_STORAGE_KEY);
    return raw ? JSON.parse(raw) as AcquisitionContext : null;
  } catch {
    return null;
  }
}

function currentJourneyId(): string {
  if (journeyId) return journeyId;
  if (typeof window === "undefined") return "server";
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(JOURNEY_STORAGE_KEY);
  } catch {
    // Continue with an in-memory journey when storage is unavailable.
  }
  if (stored && /^[a-z0-9][a-z0-9_-]{0,119}$/i.test(stored)) {
    journeyId = stored;
    return stored;
  }
  journeyId = globalThis.crypto?.randomUUID?.() ?? `journey-${Date.now()}`;
  try {
    window.localStorage.setItem(JOURNEY_STORAGE_KEY, journeyId);
  } catch {
    // The in-memory value still joins events within this page lifecycle.
  }
  return journeyId;
}

function currentAcquisitionContext(): AcquisitionContext {
  if (acquisitionContext) {
    return acquisitionContext;
  }

  const url = typeof window === "undefined"
    ? new URL("https://sharedmoney.app/")
    : new URL(window.location.href);
  const referrer = typeof document === "undefined" ? "" : document.referrer;
  const incoming = acquisitionContextFromUrl(url, referrer);
  acquisitionContext = selectFirstTouchAcquisition(readStoredAcquisitionContext(), incoming);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ACQUISITION_STORAGE_KEY, JSON.stringify(acquisitionContext));
    } catch {
      // Analytics persistence is best effort and must never block the page.
    }
  }
  return acquisitionContext;
}

function acquisitionProperties(): Record<string, string> {
  return {
    ...acquisitionContextToProperties(currentAcquisitionContext()),
    journey_id: currentJourneyId(),
  };
}

function capture(event: string, properties: Record<string, string>) {
  if (analyticsEnabled && posthogClient) {
    posthogClient.capture(event, properties);
    return;
  }

  if (analyticsRequested) {
    queuedEvents.push({ event, properties });
  }
}

export function initializeAnalytics(): boolean {
  const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
  const host = import.meta.env.VITE_POSTHOG_HOST?.trim();

  if (!key) {
    return false;
  }

  analyticsRequested = true;
  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host || "https://us.i.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        person_profiles: "never",
        persistence: "localStorage",
        property_denylist: ["$current_url", "$referrer", "$initial_referrer", "$initial_current_url"],
        before_send: (event) => event
          ? {
              ...event,
              properties: sanitizePostHogProperties(event.properties),
              $set: undefined,
              $set_once: undefined,
            }
          : null,
      });
      posthogClient = posthog;
      analyticsEnabled = true;
      posthog.identify(currentJourneyId());

      queuedEvents.splice(0).forEach(({ event, properties }) => {
        posthog.capture(event, properties);
      });
    })
    .catch(() => {
      analyticsRequested = false;
      queuedEvents.splice(0);
    });

  return true;
}

export function trackPageView(page: SeoPage) {
  const properties = {
    page_path: page.path,
    page_type: page.kind,
    region: page.region,
    ...acquisitionProperties(),
  };

  capture("seo page viewed", properties);
  capture("acquisition landing viewed", properties);
}

export function trackCtaClick(destination: PlatformDestination, placement: string) {
  const properties = {
    platform: destination.platform,
    placement,
    device: detectDevice(),
    ...acquisitionProperties(),
  };

  capture("seo cta clicked", properties);
  capture("acquisition cta clicked", properties);
}

export function trackMigrationCtaClick(page: SeoPage) {
  const properties = {
    page_path: page.path,
    page_type: page.kind,
    placement: "migration_hero",
    ...acquisitionProperties(),
    intent: "splitwise-import",
  };

  capture("seo cta clicked", properties);
  capture("acquisition cta clicked", properties);
}

export function migrationCtaHref(page: SeoPage): string {
  if (!page.cta) return "/app?intent=splitwise-import";
  return buildMigrationHandoffUrl(page.cta.href, currentAcquisitionContext(), currentJourneyId());
}

export function trackToolStarted(tool: SeoTool) {
  capture("seo tool started", { tool });
}

export function trackToolCompleted(tool: SeoTool) {
  capture("seo tool completed", { tool });
}

export function trackRelatedPageClick(from: SeoPage, to: SeoPage) {
  capture("seo related page clicked", {
    from_path: from.path,
    to_path: to.path,
  });
}

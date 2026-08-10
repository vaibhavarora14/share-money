import type { PlatformDestination } from "./landingContent";
import {
  acquisitionContextFromUrl,
  acquisitionContextToProperties,
  type AcquisitionContext,
} from "./acquisition";
import type { SeoPage, SeoTool } from "./seoPages";
import { detectDevice } from "./utils/deviceDetection";

type PostHogClient = typeof import("posthog-js").default;

let analyticsRequested = false;
let analyticsEnabled = false;
let posthogClient: PostHogClient | null = null;
const queuedEvents: Array<{ event: string; properties: Record<string, string> }> = [];
let acquisitionContext: AcquisitionContext | null = null;

function currentAcquisitionContext(): AcquisitionContext {
  if (acquisitionContext) {
    return acquisitionContext;
  }

  const url = typeof window === "undefined"
    ? new URL("https://sharedmoney.app/")
    : new URL(window.location.href);
  const referrer = typeof document === "undefined" ? "" : document.referrer;
  acquisitionContext = acquisitionContextFromUrl(url, referrer);
  return acquisitionContext;
}

function acquisitionProperties(): Record<string, string> {
  return acquisitionContextToProperties(currentAcquisitionContext());
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
        persistence: "memory",
      });
      posthogClient = posthog;
      analyticsEnabled = true;

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

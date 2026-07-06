import { Platform } from "react-native";

/** Invite-link tokens are 64 lowercase hex chars (256-bit secrets). */
export const INVITE_TOKEN_REGEX = /join\/([a-f0-9]{64})/i;

/**
 * Extracts an invite-link token from a URL (deep link, universal link, or web
 * location). Returns null when the URL is not an invite link.
 */
export function extractInviteToken(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(INVITE_TOKEN_REGEX);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Base URL used when generating shareable invite links.
 * Priority: explicit EXPO_PUBLIC_APP_URL, then the current web origin,
 * then the production web app URL.
 */
export function getInviteLinkBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_APP_URL) {
    return process.env.EXPO_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://share-money.expo.app";
}

export const CURRENT_TERMS_VERSION = "2026-08-11";

/** Existing incomplete accounts can soft-skip after this age (new signups cannot). */
export const PROFILE_COMPLETION_SKIP_AFTER_MS = 24 * 60 * 60 * 1000;

export interface TermsAcceptanceProfile {
  terms_accepted_at?: string | null;
  terms_version?: string | null;
}

export interface ProfileCompletionProfile {
  profile_completed?: boolean | null;
  full_name?: string | null;
  created_at?: string | null;
}

export function needsTermsAcceptance(
  profile: TermsAcceptanceProfile
): boolean {
  return (
    !profile.terms_accepted_at ||
    profile.terms_version !== CURRENT_TERMS_VERSION
  );
}

/** Profile is complete when the server flag is set and a display name exists. */
export function isProfileComplete(
  profile: ProfileCompletionProfile
): boolean {
  return (
    profile.profile_completed === true &&
    !!profile.full_name?.trim()
  );
}

export function needsProfileCompletion(
  profile: ProfileCompletionProfile
): boolean {
  return !isProfileComplete(profile);
}

/**
 * Returning incomplete profiles may soft-skip. Brand-new signups (account age
 * under the threshold) must complete a minimal profile first.
 */
export function canSkipProfileCompletion(
  profile: ProfileCompletionProfile,
  now = Date.now()
): boolean {
  if (!profile.created_at) return true;
  const createdAt = Date.parse(profile.created_at);
  if (Number.isNaN(createdAt)) return true;
  return now - createdAt >= PROFILE_COMPLETION_SKIP_AFTER_MS;
}

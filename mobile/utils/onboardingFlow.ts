export const CURRENT_TERMS_VERSION = "2026-08-11";

export interface TermsAcceptanceProfile {
  terms_accepted_at?: string | null;
  terms_version?: string | null;
}

export function needsTermsAcceptance(
  profile: TermsAcceptanceProfile
): boolean {
  return (
    !profile.terms_accepted_at ||
    profile.terms_version !== CURRENT_TERMS_VERSION
  );
}

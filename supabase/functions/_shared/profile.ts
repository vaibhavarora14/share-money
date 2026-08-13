export const CURRENT_TERMS_VERSION = "2026-08-11";

export function buildTermsAcceptanceUpdate(
  accepted: boolean,
  acceptedAt = new Date(),
) {
  if (accepted !== true) {
    throw new Error("Terms must be explicitly accepted");
  }

  return {
    terms_accepted_at: acceptedAt.toISOString(),
    terms_version: CURRENT_TERMS_VERSION,
  };
}

import { isAuthSessionMissingError } from "./authErrors";

export type UnauthorizedPolicy = "sign-out-local" | "throw";

type SignOutLocal = (options: {
  scope: "local";
}) => Promise<{ error: unknown | null }>;

export async function handleUnauthorizedResponse(
  policy: UnauthorizedPolicy = "sign-out-local",
  signOutLocal: SignOutLocal,
): Promise<never> {
  if (policy === "sign-out-local") {
    try {
      const { error } = await signOutLocal({ scope: "local" });
      if (error && !isAuthSessionMissingError(error)) {
        // The request still resolves to the stable Unauthorized error below.
        // Callers should not receive provider-specific session details.
      }
    } catch {
      // A failed best-effort local sign-out must not obscure the 401 response.
    }
  }

  throw new Error("Unauthorized");
}

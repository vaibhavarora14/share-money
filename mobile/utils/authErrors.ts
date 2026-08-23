export function isAuthSessionMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    name?: string;
    code?: string;
    message?: string;
  };
  const message = candidate.message?.toLowerCase() || "";

  return (
    candidate.name === "AuthSessionMissingError" ||
    candidate.code === "session_not_found" ||
    message.includes("auth session missing") ||
    message.includes("session_not_found")
  );
}

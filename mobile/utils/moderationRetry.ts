export interface ModerationRetryOptions {
  maxAttempts?: number;
  delayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_DELAY_MS = 250;

export function isRetryableModerationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("network connection was lost") ||
    message.includes("cannot connect") ||
    message.includes("connection refused") ||
    message.includes("request timed out")
  );
}

export async function retryModerationRequest<TRequest, TResult>(
  request: TRequest,
  send: (request: TRequest) => Promise<TResult>,
  options: ModerationRetryOptions = {}
): Promise<TResult> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await send(request);
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableModerationError(error)) {
        throw error;
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error("Moderation request exhausted all retry attempts");
}

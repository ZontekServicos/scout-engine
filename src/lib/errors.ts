/**
 * src/lib/errors.ts
 *
 * Error classification utilities for the ingestion pipeline.
 *
 * Transient errors are worth retrying (rate limit, server hiccup, network blip).
 * Permanent errors are not (bad filter, auth failure, resource not found).
 * This distinction lets callers decide: retry the league later vs skip it permanently.
 */

export type ErrorClass = "transient" | "permanent" | "unknown";

/**
 * HTTP status codes that indicate a transient condition (safe to retry).
 */
const TRANSIENT_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * HTTP status codes that indicate a permanent failure (no point retrying).
 */
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 422]);

/**
 * Network error keywords that suggest a transient infrastructure issue.
 */
const TRANSIENT_KEYWORDS = [
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "ECONNRESET",
  "socket hang up",
  "network timeout",
];

/**
 * Classifies an error as transient, permanent, or unknown.
 *
 * @example
 * catch (err) {
 *   if (classifyError(err) === "transient") {
 *     await sleep(backoff); retry();
 *   } else {
 *     logger.error("Permanent failure, skipping league", { err });
 *   }
 * }
 */
export function classifyError(err: unknown): ErrorClass {
  const msg = err instanceof Error ? err.message : String(err);

  // Check for HTTP status in message (format: "Sportmonks 400 Bad Request")
  const httpMatch = msg.match(/\b(\d{3})\b/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1], 10);
    if (TRANSIENT_HTTP_STATUSES.has(status)) return "transient";
    if (PERMANENT_HTTP_STATUSES.has(status)) return "permanent";
  }

  // Check for network keywords
  if (TRANSIENT_KEYWORDS.some((kw) => msg.includes(kw))) return "transient";

  return "unknown";
}

export function isTransientError(err: unknown): boolean {
  return classifyError(err) === "transient";
}

export function isPermanentError(err: unknown): boolean {
  return classifyError(err) === "permanent";
}

/**
 * Returns a human-readable label for log output.
 */
export function errorLabel(err: unknown): string {
  const cls = classifyError(err);
  const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
  return `[${cls}] ${msg}`;
}

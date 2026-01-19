/**
 * Constants for model rotation feature
 */

/** Default cooldown period: 1 hour in milliseconds */
export const DEFAULT_COOLDOWN_MS = 3600000

/** Default usage limit: 100 API calls */
export const DEFAULT_LIMIT_VALUE = 100

/** Default limit type: track API calls */
export const DEFAULT_LIMIT_TYPE: "calls" | "tokens" = "calls"

/** State file location relative to config directory */
export const STATE_FILENAME = "model-rotation-state.json"

/** Maximum age before pruning unused model state (30 days) */
export const STATE_MAX_AGE_DAYS = 30

/** Error keywords that trigger rotation */
export const ROTATION_ERROR_KEYWORDS = [
  "rate limit",
  "quota exceeded",
  "too many requests",
  "429",
  "rate_limited",
  "quota_exceeded",
  "resource_exhausted",
  "service_unavailable",
  "insufficient_quota",
  "overloaded",
  "rate_limit_error",
  "permission_denied",
  "maximum quota",
  "model not found",
  "modelfound",
  "ProviderModelNotFoundError",
  "not found",
  "invalid model",
  "does not exist",
] as const

/** Provider-specific error codes */
export const ANTHROPIC_ERROR_CODES = {
  RATE_LIMIT: 429,
  OVERLOADED: 529,
  QUOTA_EXCEEDED: 529,
} as const

export const OPENAI_ERROR_CODES = {
  RATE_LIMIT: 429,
  INSUFFICIENT_QUOTA: 429,
} as const

export const GOOGLE_ERROR_CODES = {
  QUOTA_EXCEEDED: 429,
  RESOURCE_EXHAUSTED: 429,
  UNAVAILABLE: 503,
  PERMISSION_DENIED: 403,
} as const

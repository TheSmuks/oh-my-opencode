/**
 * Type definitions for model rotation feature
 */

/**
 * Rotation configuration for a single agent
 */
export interface RotationConfig {
  /** Enable model rotation for this agent (default: false) */
  enabled: boolean
  /** What to track: 'calls' (request count) or 'tokens' (token usage) */
  limitType: "calls" | "tokens"
  /** Usage limit threshold */
  limitValue: number
  /** Cooldown period in milliseconds (default: 3600000 = 1 hour) */
  cooldownMs: number
}

/**
 * Usage statistics for a single model
 */
export interface ModelUsageStats {
  /** Number of API calls made */
  callCount: number
  /** Token count (optional, requires response parsing) */
  tokenCount?: number
  /** Last used timestamp (ISO string) */
  lastUsedAt: string
  /** Whether model is currently in cooldown */
  inCooldown: boolean
  /** When cooldown expires (ISO string, null if not in cooldown) */
  cooldownUntil: string | null
}

/**
 * Per-model rotation state
 */
export interface ModelRotationState {
  /** Usage statistics */
  usage: ModelUsageStats
  /** Whether model is permanently depleted (all models used) */
  depleted: boolean
}

/**
 * Complete rotation state for all models
 * Shared across all agents (API quota is global)
 */
export interface RotationState {
  /** Per-model state keyed by model identifier */
  [model: string]: ModelRotationState
}

/**
 * Rotation result from engine
 */
export interface RotationResult {
  /** Whether rotation occurred */
  rotated: boolean
  /** Next model to use (if rotated) */
  nextModel: string | null
  /** Reason for rotation (if occurred) */
  reason: string | null
  /** Whether all models are now depleted */
  allDepleted: boolean
}

/**
 * Parsed error information
 */
export interface ParsedError {
  /** Whether error triggers rotation */
  isRotationTriggering: boolean
  /** Error type: 'quota', 'rate_limit', 'model_not_found', or 'other' */
  errorType: "quota" | "rate_limit" | "model_not_found" | "other"
  /** Provider that generated the error */
  provider: "anthropic" | "openai" | "google" | "unknown"
  /** Human-readable message */
  message: string
}

/**
 * Provider identification
 */
export type Provider = "anthropic" | "openai" | "google" | "unknown"

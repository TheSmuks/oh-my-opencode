import type { RotationConfig, RotationResult, ModelRotationState } from "./types"
import { RotationStateManager } from "./state-manager"
import { DEFAULT_COOLDOWN_MS, DEFAULT_LIMIT_VALUE, DEFAULT_LIMIT_TYPE } from "./constants"

/**
 * Core rotation engine for round-robin model selection
 * Handles proactive and reactive rotation paths
 */
export class RotationEngine {
  private stateManager: RotationStateManager
  private agentName: string
  private config: RotationConfig

  constructor(agentName: string, config: RotationConfig, stateManager: RotationStateManager) {
    this.agentName = agentName
    this.config = config
    this.stateManager = stateManager
  }

  /**
   * Check if current model should rotate based on usage limits (proactive path)
   */
  shouldRotate(currentModel: string, availableModels: string[]): RotationResult {
    if (!this.config.enabled || availableModels.length <= 1) {
      return { rotated: false, nextModel: null, reason: null, allDepleted: false }
    }

    const currentStats = this.stateManager.getUsageStats(currentModel)
    if (!currentStats) {
      return { rotated: false, nextModel: null, reason: null, allDepleted: false }
    }

    if (this.config.limitType === "calls" && currentStats.callCount >= this.config.limitValue) {
      return this.rotate(currentModel, availableModels, `Usage limit reached (${currentStats.callCount}/${this.config.limitValue} calls)`)
    }

    return { rotated: false, nextModel: null, reason: null, allDepleted: false }
  }

  /**
   * Handle rotation triggered by API error (reactive path)
   */
  rotateOnError(currentModel: string, availableModels: string[]): RotationResult {
    if (!this.config.enabled || availableModels.length <= 1) {
      return { rotated: false, nextModel: null, reason: null, allDepleted: false }
    }

    return this.rotate(currentModel, availableModels, "API quota/rate limit error")
  }

  private rotate(currentModel: string, availableModels: string[], reason: string): RotationResult {
    const nextModel = this.findNextAvailableModel(availableModels)

    if (!nextModel) {
      this.markAllDepleted(availableModels)
      return { rotated: true, nextModel: null, reason, allDepleted: true }
    }

    this.stateManager.markDepleted(currentModel, this.config.cooldownMs)

    return { rotated: true, nextModel, reason, allDepleted: false }
  }

  private findNextAvailableModel(availableModels: string[]): string | null {
    this.stateManager.pruneOldModels(30)

    for (const model of availableModels) {
      const state = this.stateManager.getModelState(model)

      if (!state) {
        return model
      }

      if (!state.depleted && !this.stateManager.isInCooldown(model)) {
        return model
      }
    }

    return null
  }

  recordUsage(model: string): void {
    if (this.config.enabled) {
      this.stateManager.incrementUsage(model)
    }
  }

  resetCooldowns(): void {
    for (const model of this.stateManager.getAllModels()) {
      const state = this.stateManager.getModelState(model)
      if (state?.usage.inCooldown && !state.depleted) {
        this.stateManager.markAvailable(model)
      }
    }
  }

  private markAllDepleted(availableModels: string[]): void {
    for (const model of availableModels) {
      const state = this.stateManager.getModelState(model)
      if (state && !state.depleted) {
        this.stateManager.markDepleted(model, this.config.cooldownMs)
      }
    }
  }

  isFullyDepleted(availableModels: string[]): boolean {
    for (const model of availableModels) {
      const state = this.stateManager.getModelState(model)
      if (!state || !state.depleted) {
        return false
      }
    }
    return true
  }

  getNextModel(availableModels: string[]): string | null {
    return this.findNextAvailableModel(availableModels)
  }
}

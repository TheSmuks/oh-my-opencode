import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs"
import { dirname, join } from "node:path"
import { getOpenCodeConfigDir } from "../../shared/opencode-config-dir"
import type { RotationState, ModelRotationState, ModelUsageStats } from "./types"
import { STATE_FILENAME } from "./constants"

/**
 * Manages rotation state with atomic persistence
 * Follows existing pattern from ralph-loop and other hooks
 */
export class RotationStateManager {
  private stateFilePath: string
  private inMemoryState: RotationState = {}
  private stateLoaded: boolean = false

  constructor(configDir: string) {
    this.stateFilePath = join(configDir, STATE_FILENAME)
    this.ensureDirectoryExists(configDir)
    this.loadState()
  }

  private ensureDirectoryExists(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  loadState(): RotationState {
    if (this.stateLoaded) return { ...this.inMemoryState }

    try {
      if (existsSync(this.stateFilePath)) {
        const content = readFileSync(this.stateFilePath, "utf-8")
        this.inMemoryState = JSON.parse(content)
      } else {
        this.inMemoryState = {}
      }
    } catch (error) {
      console.error(`[model-rotation] Failed to load state: ${error}`)
      this.inMemoryState = {}
    }

    this.stateLoaded = true
    return { ...this.inMemoryState }
  }

  saveState(): void {
    try {
      const tempPath = `${this.stateFilePath}.tmp`
      writeFileSync(tempPath, JSON.stringify(this.inMemoryState, null, 2) + "\n", "utf-8")
      // Use atomic rename for safe file writes
      renameSync(tempPath, this.stateFilePath)
    } catch (error) {
      console.error(`[model-rotation] Failed to save state: ${error}`)
      // Try to clean up temp file if rename failed
      try {
        if (existsSync(`${this.stateFilePath}.tmp`)) {
          unlinkSync(`${this.stateFilePath}.tmp`)
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  getModelState(model: string): ModelRotationState | undefined {
    this.loadState()
    return this.inMemoryState[model]
  }

  updateModelState(model: string, updater: (current: ModelRotationState) => ModelRotationState): void {
    this.loadState()
    const current = this.getModelState(model) || this.createEmptyModelState()
    const updated = updater(current)
    this.inMemoryState[model] = updated
    this.saveState()
  }

  incrementUsage(model: string, tokensUsed?: number): void {
    this.updateModelState(model, (current) => ({
      usage: {
        ...current.usage,
        callCount: current.usage.callCount + 1,
        tokenCount:
          typeof tokensUsed === "number"
            ? (current.usage.tokenCount ?? 0) + tokensUsed
            : current.usage.tokenCount,
        lastUsedAt: new Date().toISOString(),
      },
      depleted: current.depleted,
    }))
  }

  markDepleted(model: string, cooldownMs: number): void {
    const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString()
    this.updateModelState(model, (current) => ({
      usage: {
        ...current.usage,
        lastUsedAt: new Date().toISOString(),
        inCooldown: true,
        cooldownUntil,
      },
      depleted: true,
    }))
  }

  markAvailable(model: string): void {
    this.updateModelState(model, (current) => ({
      usage: {
        ...current.usage,
        inCooldown: false,
        cooldownUntil: null,
      },
      depleted: false,
    }))
  }

  isInCooldown(model: string): boolean {
    const state = this.getModelState(model)
    if (!state?.usage.inCooldown) return false

    const cooldownUntil = new Date(state.usage.cooldownUntil!)
    const now = new Date()
    return now < cooldownUntil
  }

  getUsageStats(model: string): ModelUsageStats | undefined {
    return this.getModelState(model)?.usage
  }

  resetUsage(model: string): void {
    this.updateModelState(model, (current) => ({
      usage: {
        ...current.usage,
        callCount: 0,
        tokenCount: undefined,
      },
      depleted: false,
    }))
  }

  getAllModels(): string[] {
    this.loadState()
    return Object.keys(this.inMemoryState)
  }

  pruneOldModels(maxAgeDays: number = 30): void {
    this.loadState()
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
    let pruned = 0

    for (const [model, state] of Object.entries(this.inMemoryState)) {
      if (state.usage.lastUsedAt) {
        const lastUsed = new Date(state.usage.lastUsedAt)
        if (lastUsed < cutoffDate && !state.usage.inCooldown && state.usage.callCount === 0) {
          delete this.inMemoryState[model]
          pruned++
        }
      }
    }

    if (pruned > 0) {
      this.saveState()
    }
  }

  private createEmptyModelState(): ModelRotationState {
    return {
      usage: {
        callCount: 0,
        lastUsedAt: new Date().toISOString(),
        inCooldown: false,
        cooldownUntil: null,
      },
      depleted: false,
    }
  }

  /**
   * Select the first available model from a list, respecting cooldown and depletion state
   */
  selectAvailableModel(models: string[]): string | null {
    if (models.length === 0) return null
    if (models.length === 1) return models[0]

    this.loadState()
    this.pruneOldModels(30)

    for (const model of models) {
      const state = this.getModelState(model)

      // Model never used or not tracked - it's available
      if (!state) {
        return model
      }

      // Check if cooldown expired
      if (state.usage.inCooldown && state.usage.cooldownUntil) {
        const cooldownUntil = new Date(state.usage.cooldownUntil)
        if (new Date() >= cooldownUntil) {
          // Cooldown expired, mark as available
          this.markAvailable(model)
          return model
        }
      }

      // Model is available if not depleted and not in active cooldown
      if (!state.depleted && !this.isInCooldown(model)) {
        return model
      }
    }

    // All models depleted/in cooldown - fall back to first model
    return models[0]
  }
}

// Singleton instance for shared state across the plugin
let sharedStateManager: RotationStateManager | null = null

/**
 * Get or create the shared rotation state manager
 */
export function getSharedStateManager(): RotationStateManager {
  if (!sharedStateManager) {
    const configDir = getOpenCodeConfigDir({
      binary: "opencode",
      version: null,
    })
    sharedStateManager = new RotationStateManager(configDir)
  }
  return sharedStateManager
}

/**
 * Select the first available model from a list, using shared state
 */
export function selectAvailableModel(models: string[]): string | null {
  return getSharedStateManager().selectAvailableModel(models)
}

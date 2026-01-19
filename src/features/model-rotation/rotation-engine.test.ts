import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { RotationConfig } from "./types"
import { RotationEngine } from "./rotation-engine"
import { RotationStateManager } from "./state-manager"

function createStateManager(): RotationStateManager {
  const configDir = mkdtempSync(join(tmpdir(), "omo-model-rotation-"))
  return new RotationStateManager(configDir)
}

describe("RotationEngine", () => {
  it("should not rotate to current model", () => {
    const stateManager = createStateManager()
    const config: RotationConfig = {
      enabled: true,
      limitType: "calls",
      limitValue: 1,
      cooldownMs: 60_000,
    }

    const engine = new RotationEngine("test-agent", config, stateManager)

    const result = engine.rotateOnError("a", ["a", "b"])

    expect(result.rotated).toBe(true)
    expect(result.allDepleted).toBe(false)
    expect(result.nextModel).toBe("b")
  })

  it("should re-activate model when cooldown expired", () => {
    const stateManager = createStateManager()
    const config: RotationConfig = {
      enabled: true,
      limitType: "calls",
      limitValue: 1,
      cooldownMs: 60_000,
    }

    const engine = new RotationEngine("test-agent", config, stateManager)

    stateManager.updateModelState("b", (current) => ({
      ...current,
      usage: {
        ...current.usage,
        inCooldown: true,
        cooldownUntil: new Date(Date.now() - 1000).toISOString(),
      },
      depleted: true,
    }))

    const next = engine.getNextModel(["a", "b"], "a")

    expect(next).toBe("b")
    const state = stateManager.getModelState("b")
    expect(state?.depleted).toBe(false)
    expect(state?.usage.inCooldown).toBe(false)
  })
})

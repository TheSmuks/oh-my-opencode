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

  it("should select next model in round-robin order (not restart from first)", () => {
    // #given a rotation engine with models ["a", "b", "c"] where all are available
    const stateManager = createStateManager()
    const config: RotationConfig = {
      enabled: true,
      limitType: "calls",
      limitValue: 10,
      cooldownMs: 60_000,
    }
    const engine = new RotationEngine("test-agent", config, stateManager)

    // #when we rotate away from "b"
    const result = engine.rotateOnError("b", ["a", "b", "c"])

    // #then it should select "c" (next after "b"), not "a" (first in array)
    expect(result.rotated).toBe(true)
    expect(result.nextModel).toBe("c")
  })

  it("should wrap around to first model when current is last", () => {
    // #given a rotation engine with models ["a", "b", "c"]
    const stateManager = createStateManager()
    const config: RotationConfig = {
      enabled: true,
      limitType: "calls",
      limitValue: 10,
      cooldownMs: 60_000,
    }
    const engine = new RotationEngine("test-agent", config, stateManager)

    // #when we rotate away from "c" (last model)
    const result = engine.rotateOnError("c", ["a", "b", "c"])

    // #then it should wrap around to "a"
    expect(result.rotated).toBe(true)
    expect(result.nextModel).toBe("a")
  })

  it("should skip depleted models in round-robin order", () => {
    // #given model "c" is depleted and in cooldown
    const stateManager = createStateManager()
    const config: RotationConfig = {
      enabled: true,
      limitType: "calls",
      limitValue: 10,
      cooldownMs: 60_000,
    }
    const engine = new RotationEngine("test-agent", config, stateManager)

    // Mark "c" as depleted with active cooldown (future expiry)
    stateManager.updateModelState("c", (current) => ({
      ...current,
      usage: {
        ...current.usage,
        inCooldown: true,
        cooldownUntil: new Date(Date.now() + 60_000).toISOString(),
      },
      depleted: true,
    }))

    // #when we rotate away from "b"
    const result = engine.rotateOnError("b", ["a", "b", "c"])

    // #then it should skip "c" (depleted) and wrap to "a"
    expect(result.rotated).toBe(true)
    expect(result.nextModel).toBe("a")
  })

  it("should re-activate model when cooldown expired and reset usage counters", () => {
    // #given a model that was depleted due to hitting limits
    const stateManager = createStateManager()
    const config: RotationConfig = {
      enabled: true,
      limitType: "calls",
      limitValue: 10,
      cooldownMs: 60_000,
    }

    const engine = new RotationEngine("test-agent", config, stateManager)

    stateManager.updateModelState("b", (current) => ({
      ...current,
      usage: {
        ...current.usage,
        callCount: 10,
        tokenCount: 50000,
        inCooldown: true,
        cooldownUntil: new Date(Date.now() - 1000).toISOString(),
      },
      depleted: true,
    }))

    // #when cooldown expires and model is re-selected
    const next = engine.getNextModel(["a", "b"], "a")

    // #then model should be available with reset counters
    expect(next).toBe("b")
    const state = stateManager.getModelState("b")
    expect(state?.depleted).toBe(false)
    expect(state?.usage.inCooldown).toBe(false)
    expect(state?.usage.callCount).toBe(0)
    expect(state?.usage.tokenCount).toBeUndefined()
  })
})

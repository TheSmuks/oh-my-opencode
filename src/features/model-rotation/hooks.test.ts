import { describe, it, expect, spyOn } from "bun:test"
import type { PluginInput } from "@opencode-ai/plugin"
import type { OhMyOpenCodeConfig } from "../../config/schema"
import { createRotationHooks } from "./hooks"

function createPluginCtx(impl: {
  messages: () => Promise<{ data: unknown[] }>
}): PluginInput {
  return {
    client: {
      tui: undefined,
      session: {
        messages: () => impl.messages(),
      },
    },
  } as unknown as PluginInput
}

describe("createRotationHooks usage recording", () => {
  it("should record usage only once for repeated message.updated events", async () => {
    const pluginCtx = createPluginCtx({
      messages: async () => ({
        data: [
          { info: { role: "assistant", tokens: { input: 1, output: 2, cache: { read: 0 } } } },
        ],
      }),
    })

    const config = {
      agents: {
        "test-agent": {
          model: ["m1", "m2"],
          rotation: { enabled: true, limitType: "calls", limitValue: 10, cooldownMs: 1000 },
        },
      },
    } as unknown as OhMyOpenCodeConfig

    const hooks = createRotationHooks({ pluginCtx, config })
    expect(hooks).not.toBeNull()

    const hookEvent = hooks?.event
    if (!hookEvent) throw new Error("Expected rotation hook event")

    const testEngine = ((pluginCtx as any).__rotationTest?.map as Map<string, { engine: unknown }> | undefined)
      ?.get("test-agent")
      ?.engine
    if (!testEngine) throw new Error("Expected test engine handle")

    const recordUsageSpy = spyOn(testEngine as any, "recordUsage")

    const baseEvent = {
      event: {
        type: "message.updated",
        properties: {
          sessionID: "ses_1",
          info: {
            agent: "test-agent",
            modelID: "m1",
            role: "assistant",
          },
        },
      },
    }
    await hookEvent(baseEvent as any)
    await hookEvent(baseEvent as any)
    expect(recordUsageSpy).toHaveBeenCalledTimes(1)
  })
})

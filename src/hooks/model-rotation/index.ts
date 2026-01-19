import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { OhMyOpenCodeConfig } from "../../config/schema"
import { createRotationHooks as createRotationHooksInternal } from "../../features/model-rotation/hooks"

interface RotationHooksContext {
  pluginCtx: PluginInput
  config: OhMyOpenCodeConfig
}

export function createRotationHooks(ctx: RotationHooksContext): Hooks | null {
  if (!ctx.config.agents) return null
  return createRotationHooksInternal(ctx)
}
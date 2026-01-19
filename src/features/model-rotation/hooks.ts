import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import type { RotationConfig } from "./types"
import type { OhMyOpenCodeConfig } from "../../config/schema"
import { RotationEngine } from "./rotation-engine"
import { getSharedStateManager } from "./state-manager"
import { ErrorParser } from "./error-parser"
import { log } from "../../shared"

const AGENTS_WITH_ROTATION = new Map<string, {
  engine: RotationEngine
  config: RotationConfig
  availableModels: string[]
}>()

function normalizeModels(model: string | string[] | undefined): string[] {
  if (!model) return []
  if (Array.isArray(model)) return model
  return [model]
}

interface RotationHooksContext {
  pluginCtx: PluginInput
  config: OhMyOpenCodeConfig
}

export function createRotationHooks(ctx: RotationHooksContext): Hooks | null {
  if (!ctx.config.agents) return null

  const sharedStateManager = getSharedStateManager()
  const errorParser = new ErrorParser()

  const rotationEnabledAgents: string[] = []

  for (const [agentName, agentConfig] of Object.entries(ctx.config.agents)) {
    if (!agentConfig.rotation?.enabled || !agentConfig.model) continue

    const models = normalizeModels(agentConfig.model)
    if (models.length === 0) continue

    const engine = new RotationEngine(agentName, agentConfig.rotation, sharedStateManager)
    AGENTS_WITH_ROTATION.set(agentName, { engine, config: agentConfig.rotation, availableModels: models })
    rotationEnabledAgents.push(agentName)
  }

  if (rotationEnabledAgents.length === 0) {
    return null
  }

  const showToast = (title: string, message: string, variant: "info" | "success" | "warning" | "error") => {
    ctx.pluginCtx.client.tui
      ?.showToast({
        body: {
          title,
          message,
          variant,
          duration: 5000,
        },
      })
      .catch(() => {})
  }

  return {
    event: async (eventInput) => {
      if (eventInput.event.type !== "message.updated") return

      const info = eventInput.event.properties as { info?: unknown } | undefined

      if (!info) return

      const infoObj = info.info as { agent?: unknown; modelID?: unknown; error?: unknown; role?: unknown } | undefined

      if (!infoObj) {
        log("[model-rotation] No infoObj in event")
        return
      }

      log("[model-rotation] Event infoObj", {
        role: infoObj.role,
        agent: infoObj.agent,
        modelID: infoObj.modelID,
        hasError: !!infoObj.error,
        errorPreview: infoObj.error ? JSON.stringify(infoObj.error).slice(0, 200) : null,
      })

       if (infoObj.role !== "assistant") return

       const agentName = typeof infoObj.agent === "string" ? infoObj.agent : undefined
       if (!agentName) return

       const rotationData = AGENTS_WITH_ROTATION.get(agentName)
       if (!rotationData) return

       const modelID = typeof infoObj.modelID === "string" ? infoObj.modelID : undefined
       const currentModel = modelID ?? ""

       if (!currentModel) return

       const tokensUsed = await (async () => {
         try {
           const sessionID = (eventInput.event.properties as { sessionID?: unknown } | undefined)?.sessionID
           if (typeof sessionID !== "string") return undefined

           const response = await ctx.pluginCtx.client.session.messages({
             path: { id: sessionID },
           })

           const messages = (response.data ?? response) as { info: { role?: unknown; tokens?: unknown } }[]

           const assistantMessages = messages.filter((m) => m.info.role === "assistant")
           if (assistantMessages.length === 0) return undefined

           const lastAssistant = assistantMessages[assistantMessages.length - 1]
           const tokens = lastAssistant.info.tokens as
             | { input?: number; output?: number; cache?: { read?: number } }
             | undefined

           return (tokens?.input ?? 0) + (tokens?.cache?.read ?? 0) + (tokens?.output ?? 0)
         } catch {
           return undefined
         }
       })()

       rotationData.engine.recordUsage(currentModel, tokensUsed)

       if (!infoObj.error) return


      const error = infoObj.error
      const parsedError = errorParser.parseError(error)

      log("[model-rotation] Parsed error", {
        errorType: parsedError.errorType,
        isRotationTriggering: parsedError.isRotationTriggering,
      })

       if (!parsedError.isRotationTriggering) return

       const result = rotationData.engine.rotateOnError(currentModel, rotationData.availableModels)


      if (result.allDepleted) {
        showToast(
          "Model Rotation",
          `⚠️ ${agentName}: All models depleted (${parsedError.errorType}). Please check your API quotas.`,
          "error"
        )
        return
      }

      if (result.rotated && result.nextModel) {
        showToast(
          "Model Rotation",
          `🔄 ${agentName}: Rotating ${currentModel} → ${result.nextModel} (${result.reason})`,
          "info"
        )
      }
    },
  }
}

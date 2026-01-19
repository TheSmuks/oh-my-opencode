import { ROTATION_ERROR_KEYWORDS } from "./constants"

export class ErrorParser {
  parseError(error: unknown): {
    isRotationTriggering: boolean
    errorType: "rate_limit" | "quota" | "model_not_found" | "other"
    provider: "anthropic" | "openai" | "google" | "unknown"
    message: string
  } {
    // Handle string errors
    if (typeof error === "string") {
      return this.parseFromString(error, "unknown")
    }

    if (!error || typeof error !== "object") {
      return this.defaultResult(String(error ?? ""))
    }

    const err = error as Record<string, unknown>

    // Extract provider from model field if present
    const provider = this.detectProvider(err)

    // Check status code first (429/529 are rate limit/quota errors)
    if (err.status === 429 || err.status === 529) {
      const message = this.extractMessage(err)
      const nestedError = err.error as Record<string, unknown> | undefined
      const nestedStatus = String(nestedError?.status ?? "").toLowerCase()
      const nestedCode = String(nestedError?.code ?? "").toLowerCase()
      const nestedMessage = String(nestedError?.message ?? "").toLowerCase()
      const isQuotaError =
        nestedStatus === "resource_exhausted" ||
        message.toLowerCase().includes("exhausted") ||
        nestedCode.includes("insufficient") ||
        nestedMessage.includes("insufficient")

      const errorType = err.status === 529 || isQuotaError ? "quota" : "rate_limit"
      return {
        isRotationTriggering: true,
        errorType,
        provider: provider !== "unknown" ? provider : this.detectProviderFromErrorType(err),
        message,
      }
    }

    // Check nested error object
    const nestedError = err.error as Record<string, unknown> | undefined
    if (nestedError && typeof nestedError === "object") {
      const result = this.parseNestedError(nestedError, provider)
      if (result.isRotationTriggering) {
        return result
      }
    }

    // Check message field directly
    const message = this.extractMessage(err)
    if (this.containsRotationKeywords(message)) {
      return {
        isRotationTriggering: true,
        errorType: this.determineErrorType(message, err),
        provider,
        message,
      }
    }

    return {
      isRotationTriggering: false,
      errorType: "other",
      provider,
      message,
    }
  }

  private parseNestedError(
    nestedError: Record<string, unknown>,
    parentProvider: "anthropic" | "openai" | "google" | "unknown"
  ): {
    isRotationTriggering: boolean
    errorType: "rate_limit" | "quota" | "model_not_found" | "other"
    provider: "anthropic" | "openai" | "google" | "unknown"
    message: string
  } {
    const errorType = String(nestedError.type ?? "").toLowerCase()
    const errorCode = String(nestedError.code ?? "").toLowerCase()
    const errorStatus = String(nestedError.status ?? "").toLowerCase()
    const message = this.extractMessage(nestedError)

    // Detect provider from error type patterns
    let provider = parentProvider
    if (provider === "unknown") {
      if (errorCode.includes("rate_limit") || errorCode.includes("insufficient_quota")) {
        provider = "openai"
      } else if (errorStatus === "resource_exhausted") {
        provider = "google"
      } else if (
        errorType.includes("rate_limit") ||
        errorType === "quota_exceeded" ||
        errorType === "overloaded_error"
      ) {
        provider = "anthropic"
      }
    }

    // Check for rotation-triggering patterns
    if (
      errorType.includes("rate_limit") ||
      errorType.includes("quota") ||
      errorCode.includes("rate_limit") ||
      errorCode.includes("quota") ||
      errorCode.includes("insufficient") ||
      errorStatus === "resource_exhausted" ||
      this.containsRotationKeywords(message)
    ) {
      return {
        isRotationTriggering: true,
        errorType: this.determineErrorType(message, nestedError),
        provider,
        message,
      }
    }

    // Check for deeply nested errors (e.g., error.data.error.message)
    const deepError = nestedError.data as Record<string, unknown> | undefined
    if (deepError?.error && typeof deepError.error === "object") {
      const deepResult = this.parseNestedError(
        deepError.error as Record<string, unknown>,
        provider
      )
      if (deepResult.isRotationTriggering) {
        return deepResult
      }
    }

    return this.defaultResult(message)
  }

  private parseFromString(
    error: string,
    provider: "anthropic" | "openai" | "google" | "unknown"
  ): {
    isRotationTriggering: boolean
    errorType: "rate_limit" | "quota" | "model_not_found" | "other"
    provider: "anthropic" | "openai" | "google" | "unknown"
    message: string
  } {
    if (this.containsRotationKeywords(error)) {
      return {
        isRotationTriggering: true,
        errorType: this.determineErrorTypeFromString(error),
        provider: provider !== "unknown" ? provider : this.detectProviderFromString(error),
        message: error,
      }
    }
    return this.defaultResult(error)
  }

  private containsRotationKeywords(text: string): boolean {
    const lowerText = text.toLowerCase()
    return ROTATION_ERROR_KEYWORDS.some((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    )
  }

  private determineErrorType(
    message: string,
    error: Record<string, unknown>
  ): "rate_limit" | "quota" | "model_not_found" | "other" {
    const lowerMessage = message.toLowerCase()
    const errorType = String(error.type ?? "").toLowerCase()
    const errorCode = String(error.code ?? "").toLowerCase()
    const errorStatus = String(error.status ?? "").toLowerCase()
    const errorName = String(error.name ?? "").toLowerCase()

    if (
      lowerMessage.includes("not found") ||
      lowerMessage.includes("does not exist") ||
      lowerMessage.includes("invalid model") ||
      errorName.includes("modelnotfound") ||
      errorType.includes("not_found")
    ) {
      return "model_not_found"
    }

    if (
      lowerMessage.includes("quota") ||
      lowerMessage.includes("insufficient") ||
      lowerMessage.includes("exhausted") ||
      errorType.includes("quota") ||
      errorCode.includes("quota") ||
      errorCode.includes("insufficient") ||
      errorStatus === "resource_exhausted"
    ) {
      return "quota"
    }

    return "rate_limit"
  }

  private determineErrorTypeFromString(text: string): "rate_limit" | "quota" | "model_not_found" | "other" {
    const lowerText = text.toLowerCase()
    if (
      lowerText.includes("not found") ||
      lowerText.includes("does not exist") ||
      lowerText.includes("invalid model") ||
      lowerText.includes("modelnotfound")
    ) {
      return "model_not_found"
    }
    if (
      lowerText.includes("quota") ||
      lowerText.includes("insufficient") ||
      lowerText.includes("exhausted")
    ) {
      return "quota"
    }
    return "rate_limit"
  }

  private extractMessage(error: Record<string, unknown>): string {
    // Try common message fields
    if (typeof error.message === "string") {
      return error.message
    }

    // Try nested error.message
    const nestedError = error.error as Record<string, unknown> | undefined
    if (nestedError && typeof nestedError.message === "string") {
      return nestedError.message
    }

    // Try deeper nesting
    const deepError = nestedError?.data as Record<string, unknown> | undefined
    if (deepError?.error && typeof deepError.error === "object") {
      const deepestError = deepError.error as Record<string, unknown>
      if (typeof deepestError.message === "string") {
        return deepestError.message
      }
    }

    // Try details field
    if (typeof error.details === "string") {
      return error.details
    }
    if (typeof nestedError?.details === "string") {
      return nestedError.details
    }

    return String(error ?? "")
  }

  private detectProvider(
    error: Record<string, unknown>
  ): "anthropic" | "openai" | "google" | "unknown" {
    // Check model field first (most reliable)
    const model = String(error.model ?? "").toLowerCase()
    if (model.includes("anthropic") || model.includes("claude")) {
      return "anthropic"
    }
    if (model.includes("openai") || model.includes("gpt")) {
      return "openai"
    }
    if (model.includes("google") || model.includes("gemini")) {
      return "google"
    }

    return "unknown"
  }

  private detectProviderFromErrorType(
    error: Record<string, unknown>
  ): "anthropic" | "openai" | "google" | "unknown" {
    const nestedError = error.error as Record<string, unknown> | undefined
    if (!nestedError) return "unknown"

    const errorType = String(nestedError.type ?? "").toLowerCase()
    const errorCode = String(nestedError.code ?? "").toLowerCase()
    const errorStatus = String(nestedError.status ?? "").toLowerCase()

    // OpenAI uses code: "rate_limit_exceeded" or "insufficient_quota"
    if (errorCode.includes("rate_limit") || errorCode.includes("insufficient")) {
      return "openai"
    }

    if (
      errorType.includes("rate_limit") ||
      errorType === "quota_exceeded" ||
      errorType === "overloaded_error"
    ) {
      return "anthropic"
    }

    // Google uses status: "RESOURCE_EXHAUSTED"
    if (errorStatus === "resource_exhausted") {
      return "google"
    }

    return "unknown"
  }

  private detectProviderFromString(text: string): "anthropic" | "openai" | "google" | "unknown" {
    const lowerText = text.toLowerCase()
    if (lowerText.includes("anthropic") || lowerText.includes("claude")) {
      return "anthropic"
    }
    if (lowerText.includes("openai") || lowerText.includes("gpt")) {
      return "openai"
    }
    if (lowerText.includes("google") || lowerText.includes("gemini")) {
      return "google"
    }
    return "unknown"
  }

  private defaultResult(message: string): {
    isRotationTriggering: boolean
    errorType: "rate_limit" | "quota" | "model_not_found" | "other"
    provider: "anthropic" | "openai" | "google" | "unknown"
    message: string
  } {
    return {
      isRotationTriggering: false,
      errorType: "other",
      provider: "unknown",
      message,
    }
  }
}

import { describe, it, expect } from "bun:test"
import { ErrorParser } from "./error-parser"

describe("ErrorParser", () => {
  it("should detect Anthropic rate limit error from error object", () => {
    const parser = new ErrorParser()
    const error = {
      status: 429,
      error: {
        type: "rate_limit_error",
        message: "Rate limit exceeded",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("rate_limit")
    expect(result.provider).toBe("anthropic")
    expect(result.message).toBe("Rate limit exceeded")
  })

  it("should detect Anthropic overloaded error", () => {
    const parser = new ErrorParser()
    const error = {
      status: 529,
      error: {
        type: "overloaded_error",
        message: "Overloaded",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("quota")
    expect(result.provider).toBe("anthropic")
  })

  it("should trigger rotation for overloaded_error even without keywords in message", () => {
    const parser = new ErrorParser()
    const error = {
      status: 529,
      error: {
        type: "overloaded_error",
        message: "Server temporarily busy",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("quota")
    expect(result.provider).toBe("anthropic")
  })

  it("should detect OpenAI rate limit error", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        message: "Rate limit exceeded",
        code: "rate_limit_exceeded",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("rate_limit")
    expect(result.provider).toBe("openai")
  })

  it("should not misclassify OpenAI rate_limit_error as Anthropic", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        type: "rate_limit_error",
        message: "Rate limit exceeded",
        code: "rate_limit_exceeded",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("rate_limit")
    expect(result.provider).toBe("openai")
  })

  it("should detect OpenAI quota exceeded error", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        message: "Insufficient quota",
        code: "insufficient_quota",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("quota")
    expect(result.provider).toBe("openai")
  })

  it("should detect OpenAI insufficient_quota error with 429 status as quota", () => {
    const parser = new ErrorParser()
    const error = {
      status: 429,
      error: {
        message: "Insufficient quota",
        code: "insufficient_quota",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("quota")
    expect(result.provider).toBe("openai")
  })

  it("should detect Google resource exhausted error", () => {
    const parser = new ErrorParser()
    const error = {
      status: 429,
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: "Resource exhausted",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("quota")
    expect(result.provider).toBe("google")
  })

  it("should not trigger rotation for non-quota errors", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        message: "Internal server error",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(false)
    expect(result.errorType).toBe("other")
  })

  it("should extract error message from nested error object", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        data: {
          error: {
            message: "Rate limit exceeded",
          },
        },
      },
    }

    const result = parser.parseError(error)

    expect(result.message).toBe("Rate limit exceeded")
  })

  it("should detect quota keywords in error message", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        message: "Maximum quota reached for this account",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("quota")
  })

  it("should detect rate limit keywords in error message", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        message: "Too many requests, please rate limit",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("rate_limit")
  })

  it("should fallback to pattern matching for unknown error format", () => {
    const parser = new ErrorParser()
    const error = {
      error: {
        type: "custom_error",
        details: "Rate limit exceeded",
      },
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("rate_limit")
  })

  it("should detect 429 status code", () => {
    const parser = new ErrorParser()
    const error = {
      status: 429,
    }

    const result = parser.parseError(error)

    expect(result.isRotationTriggering).toBe(true)
    expect(result.errorType).toBe("rate_limit")
  })

  it("should identify Anthropic provider from model string", () => {
    const parser = new ErrorParser()
    const error = {
      model: "anthropic/claude-opus-4-5",
    }

    const result = parser.parseError(error)

    expect(result.provider).toBe("anthropic")
  })

  it("should identify OpenAI provider from model string", () => {
    const parser = new ErrorParser()
    const error = {
      model: "openai/gpt-5.2",
    }

    const result = parser.parseError(error)

    expect(result.provider).toBe("openai")
  })

  it("should identify Google provider from model string", () => {
    const parser = new ErrorParser()
    const error = {
      model: "google/gemini-3-flash",
    }

    const result = parser.parseError(error)

    expect(result.provider).toBe("google")
  })

  it("should default to unknown provider for unrecognized model", () => {
    const parser = new ErrorParser()
    const error = {
      model: "custom/model",
    }

    const result = parser.parseError(error)

    expect(result.provider).toBe("unknown")
  })
})

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveProvider } from "../../check-jobs.ts";

const KEYS = [
  "PREFILTER_PROVIDER_FORMAT",
  "PREFILTER_BASE_URL",
  "PREFILTER_API_KEY",
  "PREFILTER_MODEL",
  "DRAFT_MODEL",
  "ANTHROPIC_API_KEY",
];

// dotenv/config runs at module load and may populate real values (e.g. a real
// ANTHROPIC_API_KEY) into process.env from the repo's .env file. Rather than
// vi.stubEnv (which can't cleanly represent "unset"), save and fully delete
// each relevant key before every test, then restore the original afterward.
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("resolveProvider", () => {
  it("defaults to the anthropic format, endpoint, and falls back to ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const config = resolveProvider("PREFILTER", "claude-haiku-4-5");
    expect(config).toEqual({
      format: "anthropic",
      baseUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "sk-ant-test",
      model: "claude-haiku-4-5",
    });
  });

  it("uses the groq-style default endpoint when the format is openai", () => {
    process.env.PREFILTER_PROVIDER_FORMAT = "openai";
    const config = resolveProvider("PREFILTER", "llama-3.1-8b");
    expect(config.baseUrl).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("does not fall back to ANTHROPIC_API_KEY when the format is openai", () => {
    process.env.PREFILTER_PROVIDER_FORMAT = "openai";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const config = resolveProvider("PREFILTER", "llama-3.1-8b");
    expect(config.apiKey).toBeUndefined();
  });

  it("prefers an explicit tier-scoped API key over the ANTHROPIC_API_KEY fallback", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-fallback";
    process.env.PREFILTER_API_KEY = "sk-ant-explicit";
    const config = resolveProvider("PREFILTER", "claude-haiku-4-5");
    expect(config.apiKey).toBe("sk-ant-explicit");
  });

  it("honors explicit BASE_URL and MODEL overrides", () => {
    process.env.PREFILTER_BASE_URL = "https://custom.example.com/v1/messages";
    process.env.PREFILTER_MODEL = "custom-model";
    const config = resolveProvider("PREFILTER", "claude-haiku-4-5");
    expect(config.baseUrl).toBe("https://custom.example.com/v1/messages");
    expect(config.model).toBe("custom-model");
  });

  it("scopes env lookups to the given tier (DRAFT vs PREFILTER don't leak into each other)", () => {
    process.env.DRAFT_MODEL = "claude-sonnet-5";
    const config = resolveProvider("PREFILTER", "claude-haiku-4-5");
    expect(config.model).toBe("claude-haiku-4-5");
  });
});

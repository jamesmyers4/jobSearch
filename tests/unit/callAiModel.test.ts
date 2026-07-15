import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAiModel } from "../../check-jobs.ts";

// callAiModel is the shared engine behind prefilterJob and draftResume — see
// tests/unit/aiDraftPipeline.test.ts for those. This file owns the provider
// routing and response-parsing logic itself: anthropic vs openai request
// shapes, and graceful handling when a key is missing or a response comes
// back in an unexpected shape.
//
// Same env-isolation approach as resolveProvider.test.ts: dotenv/config runs
// at module load and may populate real keys from the repo's .env, so each
// relevant var is saved and fully deleted before every test, not stubbed.

const KEYS = [
  "PREFILTER_PROVIDER_FORMAT",
  "PREFILTER_BASE_URL",
  "PREFILTER_API_KEY",
  "PREFILTER_MODEL",
  "ANTHROPIC_API_KEY",
];

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
  vi.unstubAllGlobals();
});

describe("callAiModel", () => {
  it("returns an empty string and never calls fetch when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await callAiModel("system", "prompt", "PREFILTER", 10, "fallback-model");
    expect(result).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends an anthropic-format request and extracts the text block on success", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        content: [{ type: "text", text: "yes" }],
        usage: { input_tokens: 12, output_tokens: 3 },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await callAiModel("system prompt", "user prompt", "PREFILTER", 10, "claude-haiku-4-5");
    expect(result).toBe("yes");
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(options.headers["x-api-key"]).toBe("sk-ant-test");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      model: "claude-haiku-4-5",
      max_tokens: 10,
      system: "system prompt",
      messages: [{ role: "user", content: "user prompt" }],
    });
  });

  it("returns an empty string when the anthropic response has no text block", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ content: [] }) }),
    );
    const result = await callAiModel("system", "prompt", "PREFILTER", 10, "claude-haiku-4-5");
    expect(result).toBe("");
  });

  it("sends an openai-format request and extracts the message content on success", async () => {
    process.env.PREFILTER_PROVIDER_FORMAT = "openai";
    process.env.PREFILTER_API_KEY = "gsk-test";
    const fetchSpy = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({
        choices: [{ message: { content: "no" } }],
        usage: { prompt_tokens: 8, completion_tokens: 1 },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const result = await callAiModel("system prompt", "user prompt", "PREFILTER", 10, "llama-3.1-8b");
    expect(result).toBe("no");
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(options.headers.authorization).toBe("Bearer gsk-test");
    const body = JSON.parse(options.body);
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);
  });

  it("returns an empty string when the openai-format response has no choices", async () => {
    process.env.PREFILTER_PROVIDER_FORMAT = "openai";
    process.env.PREFILTER_API_KEY = "gsk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ choices: [] }) }),
    );
    const result = await callAiModel("system", "prompt", "PREFILTER", 10, "llama-3.1-8b");
    expect(result).toBe("");
  });
});

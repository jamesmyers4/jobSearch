import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchResumeCorpus, commitDraft, prefilterJob, draftResume, githubApi, type JobPosting } from "../../check-jobs.ts";

// This is the AI_PIPELINE_ENABLED-gated family of functions in main() — none
// of them run in tests/integration/main.test.ts's mocked pipeline, since that
// test deliberately leaves AI_PIPELINE_ENABLED unset (the template-kit path is
// tested separately and is the non-AI alternative). These are tested directly
// here instead, one layer below main(), the same way callAiModel's provider
// routing is tested directly in tests/unit/callAiModel.test.ts rather than
// only through the functions that call it.

const KEYS = [
  "ANTHROPIC_API_KEY",
  "PREFILTER_API_KEY",
  "PREFILTER_PROVIDER_FORMAT",
  "PREFILTER_BASE_URL",
  "PREFILTER_MODEL",
  "DRAFT_API_KEY",
  "DRAFT_PROVIDER_FORMAT",
  "DRAFT_BASE_URL",
  "DRAFT_MODEL",
  "RESUME_VAULT_TOKEN",
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

function base64(text: string) {
  return Buffer.from(text, "utf-8").toString("base64");
}

function githubJsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(data) };
}

describe("githubApi", () => {
  it("throws with the status code and path when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(githubJsonResponse({ message: "Not Found" }, false, 404)),
    );
    await expect(githubApi("resumes/missing.md")).rejects.toThrow("GitHub API 404 on resumes/missing.md");
  });

  it("resolves with the parsed JSON body when the response is ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJsonResponse({ content: base64("hi") })));
    const data = await githubApi("CONTEXT.md");
    expect(data).toEqual({ content: base64("hi") });
  });
});

describe("fetchResumeCorpus", () => {
  it("joins every readable resume file's decoded content with the --- separator", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith("/contents/resumes")) {
        return githubJsonResponse([
          { name: "resume-a.md", type: "file" },
          { name: "resume-b.md", type: "file" },
          { name: "notes", type: "dir" },
        ]);
      }
      if (url.endsWith("/contents/resumes/resume-a.md")) {
        return githubJsonResponse({ content: base64("Resume A content") });
      }
      if (url.endsWith("/contents/resumes/resume-b.md")) {
        return githubJsonResponse({ content: base64("Resume B content") });
      }
      throw new Error(`unexpected url in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const corpus = await fetchResumeCorpus();
    expect(corpus).toBe("Resume A content\n\n---\n\nResume B content");
  });

  it("excludes directory entries from the resumes listing", async () => {
    const fetchSpy = vi.fn(async (url: string) => {
      if (url.endsWith("/contents/resumes")) {
        return githubJsonResponse([{ name: "archive", type: "dir" }]);
      }
      throw new Error(`unexpected url in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const corpus = await fetchResumeCorpus();
    expect(corpus).toBe("");
  });
});

describe("commitDraft", () => {
  it("PUTs the base64-encoded content to drafts/{slug}.md with a descriptive commit message", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(githubJsonResponse({ content: {} }));
    vi.stubGlobal("fetch", fetchSpy);
    await commitDraft("acme-sdet-2026-07-15", "# Draft resume content");
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain("/contents/drafts/acme-sdet-2026-07-15.md");
    expect(options.method).toBe("PUT");
    const body = JSON.parse(options.body);
    expect(body.message).toBe("add draft resume for acme-sdet-2026-07-15");
    expect(Buffer.from(body.content, "base64").toString("utf-8")).toBe("# Draft resume content");
  });

  it("propagates a githubApi failure rather than swallowing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(githubJsonResponse({}, false, 422)));
    await expect(commitDraft("slug", "content")).rejects.toThrow("GitHub API 422 on drafts/slug.md");
  });
});

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    key: "tn:1",
    title: "Senior SDET",
    url: "https://example.com/1",
    ...overrides,
  };
}

function anthropicResponse(text: string) {
  return { json: () => Promise.resolve({ content: [{ type: "text", text }] }) };
}

describe("prefilterJob", () => {
  it("returns true when the model replies yes", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse("Yes.")));
    const job = makeJob({ title: "SDET", company: "TherapyNotes" });
    expect(await prefilterJob(job)).toBe(true);
  });

  it("returns false when the model replies no", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(anthropicResponse("no")));
    const job = makeJob({ title: "Manufacturing QC Inspector" });
    expect(await prefilterJob(job)).toBe(false);
  });

  it("includes the job's title, company, location, and truncated description in the prompt sent", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.fn().mockResolvedValue(anthropicResponse("yes"));
    vi.stubGlobal("fetch", fetchSpy);
    const job = makeJob({
      title: "SDET",
      company: "TherapyNotes",
      location: "Remote",
      description: "Uses Playwright and TypeScript.",
    });
    await prefilterJob(job);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Title: SDET");
    expect(prompt).toContain("Company: TherapyNotes");
    expect(prompt).toContain("Location: Remote");
    expect(prompt).toContain("Uses Playwright and TypeScript.");
  });

  it("returns false without ever calling fetch when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const job = makeJob({});
    expect(await prefilterJob(job)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("draftResume", () => {
  it("returns the raw model output and includes the job, context, and corpus in the prompt", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const fetchSpy = vi.fn().mockResolvedValue(anthropicResponse("# Tailored Resume\n\n..."));
    vi.stubGlobal("fetch", fetchSpy);
    const job = makeJob({ title: "SDET", company: "TherapyNotes", description: "Playwright work." });
    const result = await draftResume(job, "PAST RESUME CORPUS TEXT", "FRAMING RULES TEXT");
    expect(result).toBe("# Tailored Resume\n\n...");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Playwright work.");
    expect(prompt).toContain("PAST RESUME CORPUS TEXT");
    expect(prompt).toContain("FRAMING RULES TEXT");
    expect(prompt).toContain("NEEDS REVIEW");
  });

  it("returns an empty string without calling fetch when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const job = makeJob({});
    const result = await draftResume(job, "corpus", "context");
    expect(result).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

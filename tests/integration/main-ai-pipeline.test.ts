import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The AI_PIPELINE_ENABLED-gated path inside main() (fetchContext ->
// fetchResumeCorpus -> per-job prefilterJob -> draftResume -> commitDraft)
// isn't covered by tests/integration/main.test.ts, which deliberately leaves
// AI_PIPELINE_ENABLED unset. It's covered here instead, in its own file.
//
// AI_PIPELINE_ENABLED is read into a module-level const at import time
// (`const AI_PIPELINE_ENABLED = process.env.AI_PIPELINE_ENABLED === "true"`),
// so setting process.env in a beforeEach after check-jobs.ts has already been
// statically imported would have no effect — the constant would already be
// frozen at whatever it was on first import. Each test here instead sets the
// env var first, then uses vi.resetModules() + a dynamic import to force a
// fresh module evaluation that picks up the new value.

function base64(text: string) {
  return Buffer.from(text, "utf-8").toString("base64");
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function textResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(text),
  };
}

const CONTEXT_MD = `## Master Skill Inventory

### Confirmed
Playwright, TypeScript, Selenium, REST API testing.

### Unconfirmed
Kubernetes exposure, but not confirmed production experience.
`;

const RESUME_CONTENT = "Extensive experience with Playwright, TypeScript, Selenium, and REST API test automation.";

function anthropicJsonResponse(text: string) {
  return jsonResponse({ content: [{ type: "text", text }] });
}

function makeFetchRouter(prefilterAnswer: "yes" | "no") {
  return vi.fn(async (url: string, options: any = {}) => {
    if (url.includes("apply.workable.com/api/v1/widget/accounts/therapynotes")) {
      return jsonResponse({
        jobs: [
          {
            title: "Remote Senior QA Engineer",
            shortcode: "AI-PIPELINE-1",
            url: "https://apply.workable.com/j/AI-PIPELINE-1",
            published_on: new Date().toISOString().slice(0, 10),
            created_at: new Date().toISOString().slice(0, 10),
            country: "United States",
            city: "",
            state: "",
          },
        ],
      });
    }
    if (url.includes("jobs.workable.com/api/v1/jobs")) return jsonResponse({ jobs: [] });
    if (url.includes("remoteok.com/api")) return jsonResponse([{ last_updated: 1, legal: "x" }]);
    if (url.includes("api.greenhouse.io")) return jsonResponse({ jobs: [] });
    if (url.includes("api.lever.co")) return jsonResponse([]);
    if (url.includes("api.ashbyhq.com")) return jsonResponse({ jobs: [] });
    if (url.includes("api.adzuna.com")) return jsonResponse({ results: [] });
    if (url.includes("data.usajobs.gov")) return jsonResponse({ SearchResult: { SearchResultItems: [] } });
    if (url.includes("soltech.hire.trakstar.com")) return textResponse("<rss><channel></channel></rss>");
    if (url.includes("statheros.freshteam.com")) return textResponse("<html></html>");
    if (url.includes("careers.quarterhill.com")) return jsonResponse({ jobs: [] });
    if (url.includes("/contents/CONTEXT.md")) return jsonResponse({ content: base64(CONTEXT_MD) });
    if (url.includes("/contents/resumes/")) return jsonResponse({ content: base64(RESUME_CONTENT) });
    if (url.endsWith("/contents/resumes")) return jsonResponse([{ name: "resume1.md", type: "file" }]);
    if (url.includes("/contents/template-drafts/")) return jsonResponse({ content: {} });
    if (url.includes("/contents/drafts/")) return jsonResponse({ content: {} });
    if (url.includes("api.anthropic.com")) {
      const body = JSON.parse(options.body);
      if (body.system.includes("screening job postings")) {
        return anthropicJsonResponse(prefilterAnswer);
      }
      return anthropicJsonResponse("# Tailored Resume\n\nNEEDS REVIEW: nothing flagged.\n\nDraft content for testing.");
    }
    if (url.includes("api.resend.com")) return jsonResponse({ id: "mock-email-id" });
    throw new Error(`Unmocked URL in main() AI-pipeline integration test: ${options.method ?? "GET"} ${url}`);
  });
}

const AI_ENV_KEYS = [
  "AI_PIPELINE_ENABLED",
  "ANTHROPIC_API_KEY",
  "PREFILTER_API_KEY",
  "PREFILTER_PROVIDER_FORMAT",
  "PREFILTER_BASE_URL",
  "PREFILTER_MODEL",
  "DRAFT_API_KEY",
  "DRAFT_PROVIDER_FORMAT",
  "DRAFT_BASE_URL",
  "DRAFT_MODEL",
];

let savedEnv: Record<string, string | undefined>;
let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  savedEnv = {};
  for (const key of AI_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.AI_PIPELINE_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";

  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "jobsearch-ai-pipeline-test-"));
  process.chdir(tempDir);
  writeFileSync("seen-jobs.json", JSON.stringify(["some-other-key-already-seen"]));
  process.env.FROM_EMAIL = "alerts@example.com";
  process.env.TO_EMAIL = "me@example.com";
  process.env.RESUME_VAULT_TOKEN = "test-token";
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
  for (const key of AI_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("main() with AI_PIPELINE_ENABLED=true", () => {
  it("drafts and commits an AI resume for an allowlisted, fresh, prefilter-approved job, and attaches it to the alert email", async () => {
    const fetchMock = makeFetchRouter("yes");
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { main } = await import("../../check-jobs.ts");
    await main();

    const draftPutCalls = fetchMock.mock.calls.filter(
      ([url, opts]) => String(url).includes("/contents/drafts/") && opts?.method === "PUT",
    );
    expect(draftPutCalls).toHaveLength(1);
    expect(String(draftPutCalls[0][0])).toContain("/contents/drafts/");

    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.resend.com"));
    expect(resendCalls).toHaveLength(1);
    const alertBody = JSON.parse(resendCalls[0][1].body);
    expect(alertBody.html).toContain("AI draft attached");
    expect(alertBody.attachments.length).toBeGreaterThan(0);
    expect(alertBody.attachments[0].filename).toMatch(/\.md$/);
  });

  it("commits no draft and attaches nothing when the prefilter rejects the job", async () => {
    const fetchMock = makeFetchRouter("no");
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    const { main } = await import("../../check-jobs.ts");
    await main();

    const draftPutCalls = fetchMock.mock.calls.filter(
      ([url, opts]) => String(url).includes("/contents/drafts/") && opts?.method === "PUT",
    );
    expect(draftPutCalls).toHaveLength(0);

    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.resend.com"));
    expect(resendCalls).toHaveLength(1);
    const alertBody = JSON.parse(resendCalls[0][1].body);
    expect(alertBody.html).not.toContain("AI draft attached");
    expect(alertBody.attachments).toEqual([]);
  });
});

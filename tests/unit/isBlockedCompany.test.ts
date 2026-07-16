import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isBlockedCompany, type JobPosting } from "../../check-jobs.ts";
import type { CompanyHistory } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

describe("isBlockedCompany (real repo data)", () => {
  it("returns false for a company with no history entry", () => {
    expect(isBlockedCompany(makeJob({ company: "A Company With No History" }))).toBe(false);
  });

  it("returns false for a company missing entirely", () => {
    expect(isBlockedCompany(makeJob({ company: undefined }))).toBe(false);
  });

  it("returns false for a real 'active' entry (Golden Pet Brands)", () => {
    expect(isBlockedCompany(makeJob({ company: "Golden Pet Brands" }))).toBe(false);
  });
});

// company-history.json has no "blocked" entries today — this is the exact
// filter that gives real teeth to a future "blocked" status (unlike today's
// "caution", which only deprioritizes/tags, "blocked" removes the job from
// the pipeline entirely before it's ever scored or emailed). Exercised here
// against a synthetic file in an isolated temp cwd + a fresh module import,
// mirroring tests/integration/main-ai-pipeline.test.ts's pattern, since
// COMPANY_HISTORY is only read once at import time.
describe("isBlockedCompany (synthetic blocked data)", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "jobsearch-blockedcompany-test-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("returns true for a job at a company flagged blocked", async () => {
    const history: CompanyHistory = {
      "bad-actor-inc": {
        displayName: "Bad Actor Inc",
        aliases: ["Bad Actor"],
        applications: [],
        reapplyInvited: false,
        status: "blocked",
        statusReason: "Explicitly asked not to be contacted again.",
        lastUpdated: "2026-07-16",
      },
    };
    writeFileSync("company-history.json", JSON.stringify(history));
    const fresh = await import("../../check-jobs.ts");
    expect(fresh.isBlockedCompany(makeJob({ company: "Bad Actor, Inc." }))).toBe(true);
  });

  it("returns false for a job at a company flagged caution, not blocked", async () => {
    const history: CompanyHistory = {
      "flaky-corp": {
        displayName: "Flaky Corp",
        aliases: [],
        applications: [],
        reapplyInvited: null,
        status: "caution",
        statusReason: "Test fixture.",
        lastUpdated: "2026-07-16",
      },
    };
    writeFileSync("company-history.json", JSON.stringify(history));
    const fresh = await import("../../check-jobs.ts");
    expect(fresh.isBlockedCompany(makeJob({ company: "Flaky Corp" }))).toBe(false);
  });
});

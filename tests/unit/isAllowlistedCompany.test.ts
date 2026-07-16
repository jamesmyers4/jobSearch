import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isAllowlistedCompany, type JobPosting } from "../../check-jobs.ts";
import type { CompanyHistory } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    key: "tn:1",
    title: "Senior SDET",
    url: "https://example.com/1",
    ...overrides,
  };
}

describe("isAllowlistedCompany (real repo data)", () => {
  it("returns true for a company name matching AI_DRAFT_COMPANY_ALLOWLIST", () => {
    const job = makeJob({ company: "TherapyNotes" });
    expect(isAllowlistedCompany(job)).toBe(true);
  });

  it("matches case-insensitively and on a substring of a longer company name", () => {
    const job = makeJob({ company: "therapynotes, inc." });
    expect(isAllowlistedCompany(job)).toBe(true);
  });

  it("returns false when the company has no history entry and isn't on the allowlist", () => {
    const job = makeJob({ company: "A Company With No History" });
    expect(isAllowlistedCompany(job)).toBe(false);
  });

  it("returns false when company is missing entirely", () => {
    const job = makeJob({ company: undefined });
    expect(isAllowlistedCompany(job)).toBe(false);
  });
});

// company-history.json currently has no "caution" or "blocked" entries — both
// real companies in it are "active" (see historyStatus.test.ts for why). The
// "caution"/"blocked" exclusion branches are exercised here against a
// synthetic file in an isolated temp cwd + a fresh module import, since
// COMPANY_HISTORY is only read once at import time. Mirrors the
// vi.resetModules() + dynamic import pattern from
// tests/integration/main-ai-pipeline.test.ts.
describe("isAllowlistedCompany (synthetic caution/blocked data)", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "jobsearch-allowlist-test-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("returns false for an allowlisted company that's also flagged caution", async () => {
    // TherapyNotes is the one real entry in AI_DRAFT_COMPANY_ALLOWLIST — this
    // confirms a caution flag overrides the allowlist rather than being
    // silently bypassed by it.
    const history: CompanyHistory = {
      therapynotes: {
        displayName: "TherapyNotes",
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
    const job = makeJob({ company: "TherapyNotes" });
    expect(fresh.isAllowlistedCompany(job)).toBe(false);
  });

  it("returns false for an allowlisted company that's also flagged blocked", async () => {
    const history: CompanyHistory = {
      therapynotes: {
        displayName: "TherapyNotes",
        aliases: [],
        applications: [],
        reapplyInvited: false,
        status: "blocked",
        statusReason: "Test fixture.",
        lastUpdated: "2026-07-16",
      },
    };
    writeFileSync("company-history.json", JSON.stringify(history));
    const fresh = await import("../../check-jobs.ts");
    const job = makeJob({ company: "TherapyNotes" });
    expect(fresh.isAllowlistedCompany(job)).toBe(false);
  });
});

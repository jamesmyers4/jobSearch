import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scoreJob, FIRE_SCORE_THRESHOLD, type JobPosting } from "../../check-jobs.ts";
import type { CompanyHistory } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    key: "test:1",
    title: "QA Automation Engineer",
    url: "https://example.com/1",
    ...overrides,
  };
}

describe("scoreJob", () => {
  it("scores a TherapyNotes SDET posted today above the fire threshold", () => {
    const job = makeJob({
      key: "tn:1",
      title: "Senior SDET",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(job)).toBeGreaterThanOrEqual(FIRE_SCORE_THRESHOLD);
  });

  it("scores a generic Adzuna posting well below the fire threshold", () => {
    const job = makeJob({
      key: "az:1",
      title: "Quality Engineer",
      postedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    });
    expect(scoreJob(job)).toBeLessThan(FIRE_SCORE_THRESHOLD);
  });

  it("gives no penalty for a real 'active' history entry", () => {
    // company-history.json in the repo root marks "Golden Pet Brands" as
    // "active" (a rejection with an explicit reapply invitation, not a hard
    // pass) — this relies on that real file, not a mock, since historyStatus()
    // reads it directly. "active" companies score the same as unknown ones.
    const job = makeJob({
      key: "wk:1",
      title: "SDET",
      company: "Golden Pet Brands",
      postedAt: new Date().toISOString(),
    });
    const activeScore = scoreJob(job);
    const sameJobDifferentCompany = scoreJob({ ...job, company: "A Company With No History" });
    expect(activeScore).toBe(sameJobDifferentCompany);
  });

  describe("with a company flagged 'caution'", () => {
    // company-history.json has no "caution" entries today, so this exercises
    // the penalty branch against a synthetic file in an isolated temp cwd + a
    // fresh module import (COMPANY_HISTORY is only read once at import time).
    // Mirrors tests/integration/main-ai-pipeline.test.ts's pattern.
    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
      originalCwd = process.cwd();
      tempDir = mkdtempSync(join(tmpdir(), "jobsearch-scorejob-test-"));
      process.chdir(tempDir);
      vi.resetModules();
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
      vi.resetModules();
    });

    it("subtracts 20 points relative to the same job at an unknown company", async () => {
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
      const job = makeJob({
        key: "wk:1",
        title: "SDET",
        company: "Flaky Corp",
        postedAt: new Date().toISOString(),
      });
      const cautionScore = fresh.scoreJob(job);
      const sameJobDifferentCompany = fresh.scoreJob({ ...job, company: "A Company With No History" });
      expect(cautionScore).toBe(sameJobDifferentCompany - 20);
    });
  });

  it("gives a boost for keywords like Playwright/TypeScript appearing in the description", () => {
    const withKeywords = makeJob({
      key: "usaj:1",
      title: "Test Automation Engineer",
      description: "Uses Playwright and TypeScript daily.",
      postedAt: new Date().toISOString(),
    });
    const withoutKeywords = makeJob({
      key: "usaj:2",
      title: "Test Automation Engineer",
      postedAt: new Date().toISOString(),
    });
    expect(scoreJob(withKeywords)).toBeGreaterThan(scoreJob(withoutKeywords));
  });

  it("falls back to a zero base score for a key prefix not in SOURCE_WEIGHT", () => {
    const job = makeJob({ key: "unknownsource:1", postedAt: new Date().toISOString() });
    expect(scoreJob(job)).toBeGreaterThanOrEqual(0);
    expect(scoreJob(job)).toBeLessThan(scoreJob({ ...job, key: "tn:1" }));
  });
});

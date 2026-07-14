import { describe, it, expect } from "vitest";
import { scoreJob, FIRE_SCORE_THRESHOLD, type JobPosting } from "../../check-jobs.ts";

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

  it("penalizes a job at a company marked rejected in company-history.json", () => {
    // company-history.json in the repo root marks "Golden Pet Brands" as rejected —
    // this test relies on that real file, not a mock, since historyStatus() reads it directly.
    const job = makeJob({
      key: "wk:1",
      title: "SDET",
      company: "Golden Pet Brands",
      postedAt: new Date().toISOString(),
    });
    const rejectedScore = scoreJob(job);
    const sameJobDifferentCompany = scoreJob({ ...job, company: "A Company With No History" });
    expect(rejectedScore).toBeLessThan(sameJobDifferentCompany);
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
});

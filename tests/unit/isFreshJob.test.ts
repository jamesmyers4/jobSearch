import { describe, it, expect } from "vitest";
import { isFreshJob, MAX_ALERT_AGE_DAYS, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

describe("isFreshJob", () => {
  it("treats a job with no postedAt as fresh (unknown posting date is not disqualifying)", () => {
    expect(isFreshJob(makeJob({}))).toBe(true);
  });

  it("keeps a job posted exactly MAX_ALERT_AGE_DAYS ago", () => {
    const job = makeJob({ postedAt: daysAgo(MAX_ALERT_AGE_DAYS) });
    expect(isFreshJob(job)).toBe(true);
  });

  it("drops a job posted one day past MAX_ALERT_AGE_DAYS", () => {
    const job = makeJob({ postedAt: daysAgo(MAX_ALERT_AGE_DAYS + 1) });
    expect(isFreshJob(job)).toBe(false);
  });

  it("keeps a job posted today", () => {
    const job = makeJob({ postedAt: daysAgo(0) });
    expect(isFreshJob(job)).toBe(true);
  });
});

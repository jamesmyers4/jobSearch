import { describe, it, expect } from "vitest";
import { isRemoteJob, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

describe("isRemoteJob", () => {
  it("always treats RemoteOK postings as remote, regardless of location text", () => {
    const job = makeJob({ key: "rok:1", title: "QA Engineer", location: "Onsite in NYC" });
    expect(isRemoteJob(job)).toBe(true);
  });

  it("returns false when workArrangement is explicitly onsite, even if the title says remote", () => {
    const job = makeJob({ title: "Remote QA Engineer", workArrangement: "onsite" });
    expect(isRemoteJob(job)).toBe(false);
  });

  it("returns false when workArrangement is explicitly hybrid", () => {
    const job = makeJob({ workArrangement: "hybrid" });
    expect(isRemoteJob(job)).toBe(false);
  });

  it("returns true when workArrangement is explicitly remote", () => {
    const job = makeJob({ location: "Nashville, TN", workArrangement: "remote" });
    expect(isRemoteJob(job)).toBe(true);
  });

  it("falls back to text matching when workArrangement is absent, treating hybrid mentions as non-remote", () => {
    const job = makeJob({ location: "Hybrid - Atlanta, GA" });
    expect(isRemoteJob(job)).toBe(false);
  });

  it("falls back to text matching and accepts a REMOTE_KEYWORDS hit in the location", () => {
    const job = makeJob({ location: "Remote - US" });
    expect(isRemoteJob(job)).toBe(true);
  });

  it("falls back to text matching and accepts a REMOTE_KEYWORDS hit in the title when location is absent", () => {
    const job = makeJob({ title: "Work From Home QA Engineer" });
    expect(isRemoteJob(job)).toBe(true);
  });

  it("returns false when neither workArrangement nor text gives any remote signal", () => {
    const job = makeJob({ location: "Nashville, TN" });
    expect(isRemoteJob(job)).toBe(false);
  });
});

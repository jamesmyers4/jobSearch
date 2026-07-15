import { describe, it, expect } from "vitest";
import { draftHeader, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    key: "tn:1",
    title: "Senior SDET",
    url: "https://example.com/jobs/1",
    ...overrides,
  };
}

describe("draftHeader", () => {
  it("includes title, company, posting url, location, and the discovered label", () => {
    const job = makeJob({
      company: "TherapyNotes",
      location: "Remote",
      postedAt: new Date().toISOString(),
    });
    const header = draftHeader(job);
    expect(header).toContain("# Senior SDET — TherapyNotes");
    expect(header).toContain("Posting: https://example.com/jobs/1");
    expect(header).toContain("Location: Remote");
    expect(header).toContain("Discovered: posted today");
  });

  it("falls back to placeholder text for missing company, location, and description", () => {
    const job = makeJob({});
    const header = draftHeader(job);
    expect(header).toContain("unknown company");
    expect(header).toContain("Location: unknown");
    expect(header).toContain("Not provided by source.");
  });

  it("includes the real description verbatim when present", () => {
    const job = makeJob({ description: "Uses Playwright and TypeScript daily." });
    const header = draftHeader(job);
    expect(header).toContain("Uses Playwright and TypeScript daily.");
    expect(header).toContain("## Original Job Description");
  });
});

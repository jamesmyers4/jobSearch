import { describe, it, expect } from "vitest";
import { dedupeBySignature, normalizeForDedupe, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

describe("normalizeForDedupe", () => {
  it("lowercases, strips punctuation, and drops common company suffixes", () => {
    expect(normalizeForDedupe("TherapyNotes, Inc.")).toBe("therapynotes");
    expect(normalizeForDedupe("Acme LLC")).toBe("acme");
    expect(normalizeForDedupe("Acme Corp")).toBe("acme");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(normalizeForDedupe("  Acme   Health  ")).toBe("acme health");
  });
});

describe("dedupeBySignature", () => {
  it("collapses two postings for the same role at company-name variants of the same employer", () => {
    const jobs: JobPosting[] = [
      makeJob({ key: "tn:1", title: "Senior SDET", company: "TherapyNotes" }),
      makeJob({ key: "wk:1", title: "Senior SDET", company: "TherapyNotes, Inc." }),
    ];
    expect(dedupeBySignature(jobs)).toHaveLength(1);
  });

  it("keeps two postings with the same title at genuinely different companies", () => {
    const jobs: JobPosting[] = [
      makeJob({ key: "tn:1", title: "SDET", company: "Company A" }),
      makeJob({ key: "wk:1", title: "SDET", company: "Company B" }),
    ];
    expect(dedupeBySignature(jobs)).toHaveLength(2);
  });

  it("falls back to job.key for dedupe when company is absent", () => {
    const jobs: JobPosting[] = [
      makeJob({ key: "rok:1", title: "SDET" }),
      makeJob({ key: "rok:1", title: "SDET" }),
      makeJob({ key: "rok:2", title: "SDET" }),
    ];
    expect(dedupeBySignature(jobs)).toHaveLength(2);
  });

  it("keeps the first occurrence when deduping", () => {
    const first = makeJob({ key: "tn:1", title: "SDET", company: "Acme", url: "https://x/first" });
    const second = makeJob({ key: "wk:1", title: "SDET", company: "Acme", url: "https://x/second" });
    const [result] = dedupeBySignature([first, second]);
    expect(result.url).toBe("https://x/first");
  });
});

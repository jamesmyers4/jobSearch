import { describe, it, expect } from "vitest";
import { slugify, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

describe("slugify", () => {
  it("lowercases and hyphenates the company, title, and today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const job = makeJob({ company: "TherapyNotes", title: "Senior SDET" });
    expect(slugify(job)).toBe(`therapynotes-senior-sdet-${today}`);
  });

  it("falls back to 'unknown' when company is absent", () => {
    const job = makeJob({ company: undefined, title: "SDET" });
    expect(slugify(job)).toMatch(/^unknown-sdet-\d{4}-\d{2}-\d{2}$/);
  });

  it("collapses non-alphanumeric characters into single hyphens and trims leading/trailing hyphens", () => {
    const job = makeJob({ company: "Acme, Inc.", title: "QA / SDET (Remote!)" });
    expect(slugify(job)).toMatch(/^acme-inc-qa-sdet-remote-\d{4}-\d{2}-\d{2}$/);
  });
});

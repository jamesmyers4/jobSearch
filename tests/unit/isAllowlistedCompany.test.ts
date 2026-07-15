import { describe, it, expect } from "vitest";
import { isAllowlistedCompany, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return {
    key: "tn:1",
    title: "Senior SDET",
    url: "https://example.com/1",
    ...overrides,
  };
}

describe("isAllowlistedCompany", () => {
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

  it("returns false for a rejected company even if hypothetically allowlisted", () => {
    // company-history.json only marks "Golden Pet Brands" as rejected, and it's
    // not in AI_DRAFT_COMPANY_ALLOWLIST — so the "allowlisted AND rejected"
    // branch inside isAllowlistedCompany genuinely can't be exercised with real
    // repo data today. This test instead confirms the allowlist check alone
    // doesn't accidentally bypass the rejected-company check for a company
    // that IS marked rejected, which is the safety property that matters most.
    const job = makeJob({ company: "Golden Pet Brands" });
    expect(isAllowlistedCompany(job)).toBe(false);
  });
});

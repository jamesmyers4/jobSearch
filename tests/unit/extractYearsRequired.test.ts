import { describe, it, expect } from "vitest";
import { extractYearsRequired } from "../../check-jobs.ts";

describe("extractYearsRequired", () => {
  it("returns undefined when description is absent", () => {
    expect(extractYearsRequired(undefined)).toBeUndefined();
  });

  it("returns undefined when the description mentions no years-of-experience requirement", () => {
    expect(extractYearsRequired("We build great software as a team.")).toBeUndefined();
  });

  it("extracts a simple 'N+ years ... experience' phrase", () => {
    const result = extractYearsRequired("Requires 5+ years of experience in test automation.");
    expect(result).toMatch(/5\+?\s*years?.*experience/i);
  });

  it("extracts a range like '3-5 years ... experience'", () => {
    const result = extractYearsRequired("Looking for 3-5 years of hands-on experience.");
    expect(result).toContain("3-5");
  });

  it("does not match when 'experience' appears too far after the year mention", () => {
    const longGap = "5 years " + "x".repeat(60) + " of relevant experience";
    expect(extractYearsRequired(longGap)).toBeUndefined();
  });
});

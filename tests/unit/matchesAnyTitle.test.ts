import { describe, it, expect } from "vitest";
import { matchesAnyTitle } from "../../check-jobs.ts";

describe("matchesAnyTitle", () => {
  it("matches core SDET/QA phrasing already in SEARCH_TITLES", () => {
    expect(matchesAnyTitle("SDET")).toBe(true);
    expect(matchesAnyTitle("Senior Quality Assurance Engineer")).toBe(true);
    expect(matchesAnyTitle("QA Automation Engineer")).toBe(true);
  });

  it("rejects an unrelated title", () => {
    expect(matchesAnyTitle("Account Executive")).toBe(false);
  });

  // Real, current titles pulled from a live sweep of every SEARCH_TITLES
  // query against jobs.workable.com's cross-search endpoint (2026-07-15) —
  // genuine SDET/QA-automation-adjacent postings that were silently
  // dropped because their exact phrasing wasn't a substring of anything in
  // SEARCH_TITLES. Same failure shape as the TherapyNotes "Quality
  // Assurance Engineer" gap: real title, real posting, no crash, just gone.
  it("matches real live titles found by a title-coverage sweep across configured sources", () => {
    expect(matchesAnyTitle("Senior Software Engineer in Test")).toBe(true);
    expect(matchesAnyTitle("Senior Software Engineer in Test (BE)")).toBe(true);
    expect(matchesAnyTitle("Software Tester")).toBe(true);
    expect(matchesAnyTitle("Senior Software Tester")).toBe(true);
    expect(matchesAnyTitle("Software Testing Engineer")).toBe(true);
    expect(matchesAnyTitle("Senior Software Testing Engineer")).toBe(true);
    expect(matchesAnyTitle("QA Architect")).toBe(true);
    expect(matchesAnyTitle("Senior QA Architect")).toBe(true);
    expect(matchesAnyTitle("Test Automation Specialist")).toBe(true);
    expect(matchesAnyTitle("Automation Testing Engineer")).toBe(true);
  });

  // Same sweep surfaced titles that are real, current, and QA/test-adjacent
  // by eye, but whose gap is punctuation or word-insertion, not missing
  // vocabulary — adding a substring for one breaks the same way for the
  // next slightly-different insertion. Documented as a known, deliberately
  // unfixed gap (see CONTEXT.md) rather than solved with narrower and
  // narrower phrase entries.
  it("still misses titles broken by inserted punctuation rather than missing vocabulary (documented gap, not fixed here)", () => {
    expect(matchesAnyTitle("Software Quality Assurance - Engineer")).toBe(false);
    expect(matchesAnyTitle("Journeyman Software Quality Assurance Tester-Engineer")).toBe(false);
  });
});

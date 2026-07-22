import { describe, it, expect } from "vitest";
import { isDomesticJob, type JobPosting } from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

describe("isDomesticJob", () => {
  it("returns true when the structured country field is United States", () => {
    const job = makeJob({ country: "United States", location: "Remote" });
    expect(isDomesticJob(job)).toBe(true);
  });

  it("is case-insensitive and tolerates common US abbreviations in the structured country field", () => {
    expect(isDomesticJob(makeJob({ country: "USA" }))).toBe(true);
    expect(isDomesticJob(makeJob({ country: "usa" }))).toBe(true);
    expect(isDomesticJob(makeJob({ country: "US" }))).toBe(true);
  });

  it("returns false when the structured country field is a real non-US country (the Peru bug case)", () => {
    // This is the exact shape produced by fetchTitleSearchJobs for the real
    // captured "remote... in Peru" Workable posting — workArrangement is
    // "remote" so isRemoteJob alone lets it through; isDomesticJob is what
    // actually catches it.
    const job = makeJob({ country: "Peru", workArrangement: "remote", location: "Peru" });
    expect(isDomesticJob(job)).toBe(false);
  });

  it("trusts the structured country field over location text, even if location text looks US-shaped", () => {
    const job = makeJob({ country: "India", location: "Remote - US timezone overlap preferred" });
    expect(isDomesticJob(job)).toBe(false);
  });

  it("falls back to scanning location text for a non-US country name when no structured country field is present", () => {
    // RemoteOK, USAJOBS, SOLTECH, and Quarterhill don't expose a reliable
    // structured country field, so their free-text location is the only
    // signal available.
    const job = makeJob({ location: "Remote (Germany only)" });
    expect(isDomesticJob(job)).toBe(false);
  });

  it("allows a job through when location text has no non-US country signal and no structured country field exists", () => {
    const job = makeJob({ location: "Remote - Nashville, TN" });
    expect(isDomesticJob(job)).toBe(true);
  });

  it("allows a job through when neither country nor location is present at all", () => {
    const job = makeJob({});
    expect(isDomesticJob(job)).toBe(true);
  });

  it("does not false-positive on US place names that collide with non-US country-keyword substrings", () => {
    // "Chile" isn't a US place name, but a couple of NON_US_LOCATION_KEYWORDS
    // entries are intentionally excluded (e.g. "Georgia") specifically to
    // avoid colliding with US state names — confirm a genuine US state
    // posting isn't accidentally caught by the denylist.
    const job = makeJob({ location: "Atlanta, Georgia" });
    expect(isDomesticJob(job)).toBe(true);
  });
});

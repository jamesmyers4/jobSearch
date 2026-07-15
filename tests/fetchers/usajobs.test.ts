import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchUSAJobs, fetchAllUSAJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/usajobs-response.json", "utf-8"),
);

function mockFetch(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: () => Promise.resolve(json) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchUSAJobs", () => {
  it("keeps a real matching Test Automation Engineer posting and drops a real non-matching dispatcher posting", async () => {
    // Real captured data.usajobs.gov response for "test automation": one
    // genuine Test Automation Engineer role at SSA, plus a Public Safety
    // Telecommunicator role that must be filtered out.
    mockFetch(realResponse);
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "usaj:SSA12879403-26-DHA-CIO",
      title: "Test Automation Engineer",
      url: "https://www.usajobs.gov:443/job/856707700",
      company: "Social Security Administration",
      location: "Woodlawn, Maryland",
      postedAt: "2026-02-06T00:00:00",
    });
    expect(jobs[0].yearsRequired).toMatch(/3\+?\s*years?/i);
  });

  it("formats salary using remuneration.Description instead of the raw RateIntervalCode abbreviation", async () => {
    // remuneration.RateIntervalCode is a raw abbreviation ("PA") that doesn't
    // match formatSalaryRange's "Per X" -> "/X" suffix pattern. The real API
    // already returns a human-readable field right next to it,
    // remuneration.Description (e.g. "Per Year"), which is shaped correctly
    // for that conversion — the same way Adzuna's "Per Year" string works.
    mockFetch(realResponse);
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs[0].salaryRange).toBe("$143,913–$197,200 /Year");
  });

  it("formats an hourly rate using the real second fixture job's remuneration shape", async () => {
    // The real fixture's second job ("Public Safety Telecommunicator") is
    // filtered out by matchesAnyTitle since it isn't a QA/SDET role, but its
    // real remuneration shape (MinimumRange/MaximumRange/Description: "Per
    // Hour") is worth locking down against a matching title too.
    mockFetch({
      SearchResult: {
        SearchResultItems: [
          {
            MatchedObjectDescriptor: {
              PositionTitle: "Test Engineer",
              PositionID: "TEST-HOURLY-1",
              OrganizationName: "Some Agency",
              PositionLocationDisplay: "Somewhere, USA",
              PositionURI: "https://www.usajobs.gov:443/job/000000",
              PublicationStartDate: "2026-07-01T00:00:00",
              PositionRemuneration: [
                { MinimumRange: "22.87", MaximumRange: "26.68", RateIntervalCode: "PH", Description: "Per Hour" },
              ],
            },
          },
        ],
      },
    });
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs[0].salaryRange).toBe("$23–$27 /Hour");
  });

  it("returns an empty array rather than throwing when the response has no SearchResultItems field", async () => {
    mockFetch({});
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs).toEqual([]);
  });
});

describe("fetchAllUSAJobs", () => {
  it("dedupes the same posting returned across multiple USAJOBS_KEYWORDS queries", async () => {
    mockFetch(realResponse);
    const jobs = await fetchAllUSAJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].key).toBe("usaj:SSA12879403-26-DHA-CIO");
  });
});

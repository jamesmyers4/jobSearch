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

  it("formats salary using the real RateIntervalCode abbreviation, which doesn't match the 'Per X' suffix pattern", async () => {
    // formatSalaryRange's suffix logic replaces a leading "Per " (e.g. Adzuna's
    // "Per Year") with "/" — but USAJOBS's real RateIntervalCode is the raw
    // abbreviation "PA", not "Per Year", so it passes through unconverted.
    mockFetch(realResponse);
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs[0].salaryRange).toBe("$143,913–$197,200 PA");
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

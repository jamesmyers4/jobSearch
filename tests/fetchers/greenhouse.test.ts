import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchGreenhouseJobs, fetchAllGreenhouseJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/greenhouse-response.json", "utf-8"),
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

describe("fetchGreenhouseJobs", () => {
  it("keeps a real matching QA Automation Engineer posting and drops a real non-matching Data Analyst posting", async () => {
    // Real captured impiricus Greenhouse board: one QA Automation Engineer
    // posting (should match) alongside a Data Analyst posting (should not).
    mockFetch(realResponse);
    const jobs = await fetchGreenhouseJobs("impiricus");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "gh:impiricus:4993696008",
      title: "QA Automation Engineer",
      url: "https://job-boards.greenhouse.io/impiricus/jobs/4993696008",
      company: "impiricus",
      location: "Atlanta, GA | Remote, USA",
      postedAt: "2026-07-10T13:31:21-04:00",
    });
  });
});

describe("fetchAllGreenhouseJobs", () => {
  it("aggregates jobs across all configured GREENHOUSE_COMPANIES", async () => {
    mockFetch(realResponse);
    const jobs = await fetchAllGreenhouseJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].key).toBe("gh:impiricus:4993696008");
  });
});

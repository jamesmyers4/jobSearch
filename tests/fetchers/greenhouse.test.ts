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
    // Real captured impiricus Greenhouse board (with ?content=true): one QA
    // Automation Engineer posting (should match) alongside a Data Analyst
    // posting (should not).
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

  it("strips the real HTML-escaped job.content into a plain-text description", async () => {
    // The real Greenhouse API response has job.content as HTML markup that's
    // itself HTML-entity-encoded (e.g. "&lt;p&gt;" for a literal "<p>" tag),
    // per a real live capture against api.greenhouse.io. Confirm the mapped
    // description is plain, readable text with no tags or entities left in it.
    mockFetch(realResponse);
    const jobs = await fetchGreenhouseJobs("impiricus");
    expect(jobs[0].description).toContain("Job Title: QA Automation Engineer");
    expect(jobs[0].description).not.toMatch(/<[^>]*>/);
    expect(jobs[0].description).not.toContain("&lt;");
    expect(jobs[0].description).not.toContain("&nbsp;");
  });

  it("populates yearsRequired and workArrangement from the real job.content, now that description is mapped", async () => {
    // Before this fix, fetchGreenhouseJobs requested ?content=true but never
    // read job.content into description, so extractYearsRequired/
    // extractWorkArrangement never ran on Greenhouse postings at all.
    mockFetch(realResponse);
    const jobs = await fetchGreenhouseJobs("impiricus");
    expect(jobs[0].yearsRequired).toMatch(/3\+?\s*years?/i);
    expect(jobs[0].workArrangement).toBe("remote");
  });

  it("returns an empty array rather than throwing when the response has no jobs field", async () => {
    mockFetch({});
    const jobs = await fetchGreenhouseJobs("impiricus");
    expect(jobs).toEqual([]);
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

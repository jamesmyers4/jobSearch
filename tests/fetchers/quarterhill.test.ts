import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchQuarterhillJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/quarterhill-response.json", "utf-8"),
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

describe("fetchQuarterhillJobs", () => {
  it("correctly filters out real postings that don't match SEARCH_TITLES (PMO, field tech, electrician roles)", async () => {
    // This is the actual response captured from Quarterhill's internal jobs
    // API. At capture time none of the open roles were QA/SDET-focused, so
    // all three should be filtered out by matchesAnyTitle on genuinely real data.
    mockFetch(realResponse);
    const jobs = await fetchQuarterhillJobs();
    expect(jobs).toEqual([]);
  });

  it("maps a matching posting's fields, including a formatted salary range with no interval suffix", async () => {
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9001",
            title: "QA Automation Engineer",
            location_name: "Remote - US",
            posted_date: "2026-07-10T12:00:00+0000",
            canonical_url: "https://careers.quarterhill.com/jobs/9001?lang=en-us",
            apply_url: "https://careers-quarterhill.icims.com/jobs/9001/login",
            salary_min_value: 90000,
            salary_max_value: 120000,
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "qh:9001",
      title: "QA Automation Engineer",
      url: "https://careers.quarterhill.com/jobs/9001?lang=en-us",
      company: "Quarterhill",
      location: "Remote - US",
      postedAt: "2026-07-10T12:00:00+0000",
      salaryRange: "$90,000–$120,000",
    });
  });

  it("falls back to apply_url and leaves salaryRange undefined when values are zero", async () => {
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9002",
            title: "Senior Test Automation Engineer",
            location_name: "QH Frisco",
            posted_date: "2026-07-11T12:00:00+0000",
            canonical_url: undefined,
            apply_url: "https://careers-quarterhill.icims.com/jobs/9002/login",
            salary_min_value: 0,
            salary_max_value: 0,
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs[0].url).toBe("https://careers-quarterhill.icims.com/jobs/9002/login");
    expect(jobs[0].salaryRange).toBeUndefined();
  });

  it("returns an empty array rather than throwing when the response has no jobs field", async () => {
    mockFetch({});
    const jobs = await fetchQuarterhillJobs();
    expect(jobs).toEqual([]);
  });
});

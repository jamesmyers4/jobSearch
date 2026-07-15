import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchAdzunaJobs, fetchAllAdzunaJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/adzuna-response.json", "utf-8"),
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

describe("fetchAdzunaJobs", () => {
  it("excludes a manufacturing posting and maps the matching QA posting's fields correctly", async () => {
    // Real captured Adzuna response: one QA Automation Engineer posting and
    // one Manufacturing QC Inspector posting that must be filtered by
    // EXCLUDE_KEYWORDS ("manufacturing") even though "QC" sounds relevant.
    mockFetch(realResponse);
    const jobs = await fetchAdzunaJobs("QA Automation Engineer");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "az:5799030504",
      title: "QA Automation Engineer",
      url: "https://www.adzuna.com/land/ad/5799030504",
      company: "Acme Health",
      location: "Remote - US",
      postedAt: "2026-07-13T10:00:00Z",
      salaryRange: "$90,000–$120,000 /Year",
      workArrangement: "hybrid",
    });
    expect(jobs[0].yearsRequired).toMatch(/5\+?\s*years?/i);
  });

  it("leaves salaryRange undefined when both salary fields are null", async () => {
    mockFetch({
      results: [
        {
          id: "1",
          title: "SDET",
          redirect_url: "https://example.com/1",
          company: { display_name: "No Salary Co" },
          location: { display_name: "Remote" },
          created: "2026-07-13T10:00:00Z",
          salary_min: null,
          salary_max: null,
          description: "Remote SDET role.",
        },
      ],
    });
    const jobs = await fetchAdzunaJobs("SDET");
    expect(jobs[0].salaryRange).toBeUndefined();
  });

  it("returns an empty array rather than throwing when the response has no results field", async () => {
    mockFetch({});
    const jobs = await fetchAdzunaJobs("SDET");
    expect(jobs).toEqual([]);
  });
});

describe("fetchAllAdzunaJobs", () => {
  it("dedupes the same posting returned across multiple title queries", async () => {
    mockFetch(realResponse);
    const jobs = await fetchAllAdzunaJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].key).toBe("az:5799030504");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchTitleSearchJobs, fetchAllTitleSearchJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/workable-search-response.json", "utf-8"),
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

describe("fetchTitleSearchJobs", () => {
  it("maps matching real postings, exposing two real field-mapping quirks", async () => {
    // Real jobs.workable.com response shape differs from what fetchTitleSearchJobs
    // expects in two ways that are worth locking down rather than losing track of:
    //   1. job.company is { id, title, website } — there's no job.company.name or
    //      top-level job.companyName, so `company` maps to undefined for every
    //      real Workable cross-search result as currently written.
    //   2. job.location is { city, subregion, countryName } with no location_str
    //      field, so `job.location?.location_str ?? job.location` falls through
    //      to the whole object, not a string.
    // Also job.updatedAt doesn't exist on the real payload (it's "updated"),
    // so postedAt is always undefined for this source today.
    mockFetch(realResponse);
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      key: "wk:897a7a1f-93ec-42d8-901a-5bd3a29aee51",
      title: "Software Development Engineer in Test (SDET)",
      url: "https://jobs.workable.com/view/hYCFFefUaYqF8rSwJz2ojM/software-development-engineer-in-test-(sdet)-in-hyderabad-at-accellor",
      company: undefined,
      postedAt: undefined,
    });
    expect(jobs[0].location).toEqual({
      city: "Hyderabad",
      subregion: "Telangana",
      countryName: "India",
    });
  });

  it("filters out a non-matching title using the real payload's schema", async () => {
    mockFetch({
      jobs: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Enterprise Account Executive",
          url: "https://jobs.workable.com/view/xyz/account-executive",
          location: { city: "Austin", subregion: "Texas", countryName: "United States" },
          created: "2026-07-01T00:00:00.000Z",
          updated: "2026-07-01T00:00:00.000Z",
          company: { id: "1", title: "Some Co" },
        },
      ],
    });
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs).toEqual([]);
  });

  it("falls back to job.uuid and job.shortlink when id/url are absent", async () => {
    mockFetch({
      jobs: [
        {
          uuid: "fallback-uuid",
          title: "QA Automation Engineer",
          shortlink: "https://jobs.workable.com/view/fallback",
          location: { city: "Remote", countryName: "United States" },
          company: { title: "Fallback Co" },
        },
      ],
    });
    const jobs = await fetchTitleSearchJobs("QA");
    expect(jobs[0].key).toBe("wk:fallback-uuid");
    expect(jobs[0].url).toBe("https://jobs.workable.com/view/fallback");
  });
});

describe("fetchAllTitleSearchJobs", () => {
  it("dedupes the same posting returned across multiple SEARCH_TITLES queries", async () => {
    mockFetch(realResponse);
    const jobs = await fetchAllTitleSearchJobs();
    expect(jobs).toHaveLength(2);
  });
});

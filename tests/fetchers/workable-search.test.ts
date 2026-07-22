import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchTitleSearchJobs, fetchAllTitleSearchJobs, isDomesticJob } from "../../check-jobs.ts";

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
  it("maps company, location, and postedAt correctly from the real jobs.workable.com shape", async () => {
    // job.company is { id, title, website } — company comes from .title, not
    // .name. job.location is { city, subregion, countryName } with no
    // location_str field, so it's built into a joined string instead of
    // passed through as an object. The real timestamp field is "updated",
    // not "updatedAt".
    mockFetch(realResponse);
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      key: "wk:897a7a1f-93ec-42d8-901a-5bd3a29aee51",
      title: "Software Development Engineer in Test (SDET)",
      url: "https://jobs.workable.com/view/hYCFFefUaYqF8rSwJz2ojM/software-development-engineer-in-test-(sdet)-in-hyderabad-at-accellor",
      company: "Accellor",
      location: "Hyderabad, Telangana, India",
      postedAt: "2026-04-13T07:08:13.046Z",
    });
  });

  it("skips empty/null location parts cleanly instead of producing stray separators (real fixture's second job)", async () => {
    // The second real fixture job has location.city: "" and
    // location.subregion: null — confirm those get filtered out rather than
    // producing ", , Peru" or similar.
    mockFetch(realResponse);
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs[1]).toMatchObject({
      key: "wk:385b77ee-3146-45f6-8154-a1c584a63962",
      company: "OrderMesh",
      location: "Peru",
      postedAt: "2026-07-07T00:17:31.657Z",
    });
  });

  it("maps job.location.countryName into JobPosting.country for both real fixture jobs (root cause of the foreign-posting bug)", async () => {
    // This is the real captured payload that exposed the bug: an on-site
    // job in Hyderabad, India and a fully-remote job based in Peru, both
    // returned by Workable's global cross-search with no geographic
    // scoping in the query. Before isDomesticJob existed, the Peru job's
    // workArrangement of "remote" was enough on its own to sail through
    // isRemoteJob and reach an alert email — this asserts the country is
    // now captured so isDomesticJob (see isDomesticJob.test.ts) can catch it.
    mockFetch(realResponse);
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs[0].country).toBe("India");
    expect(jobs[1].country).toBe("Peru");
    expect(isDomesticJob(jobs[1])).toBe(false);
  });

  it("maps the real workplace field into workArrangement (remote/hybrid/on_site -> onsite)", async () => {
    // A live capture of this endpoint (2026-07-15) confirmed job.workplace
    // takes exactly three real values: "remote", "hybrid", "on_site" — a
    // clean field this endpoint has that the account-widget endpoint
    // doesn't (that one only has a telecommuting boolean). The real fixture
    // already has one of each of the two non-hybrid values across its two
    // jobs: job[0] is "on_site", job[1] is "remote".
    mockFetch(realResponse);
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs[0].workArrangement).toBe("onsite");
    expect(jobs[1].workArrangement).toBe("remote");
  });

  it("maps a hybrid workplace value into workArrangement", async () => {
    mockFetch({
      jobs: [
        {
          id: "hybrid-job",
          title: "SDET",
          url: "https://jobs.workable.com/view/hybrid-job",
          location: { city: "Chicago", countryName: "United States" },
          company: { title: "Some Co" },
          workplace: "hybrid",
        },
      ],
    });
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs[0].workArrangement).toBe("hybrid");
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
    expect(jobs[0].company).toBe("Fallback Co");
    expect(jobs[0].location).toBe("Remote, United States");
  });

  it("falls back to data.results when data.jobs is absent", async () => {
    mockFetch({
      results: [
        {
          id: "results-fallback",
          title: "SDET",
          url: "https://jobs.workable.com/view/results-fallback",
          location: { city: "Remote" },
        },
      ],
    });
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs[0].key).toBe("wk:results-fallback");
  });

  it("returns an empty array rather than throwing when neither jobs nor results is present", async () => {
    mockFetch({});
    const jobs = await fetchTitleSearchJobs("SDET");
    expect(jobs).toEqual([]);
  });
});

describe("fetchAllTitleSearchJobs", () => {
  it("dedupes the same posting returned across multiple SEARCH_TITLES queries", async () => {
    mockFetch(realResponse);
    const jobs = await fetchAllTitleSearchJobs();
    expect(jobs).toHaveLength(2);
  });
});

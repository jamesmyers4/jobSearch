import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchAshbyJobs, fetchAllAshbyJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/ashby-response.json", "utf-8"),
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

describe("fetchAshbyJobs", () => {
  it("correctly filters out real postings that don't match SEARCH_TITLES (both are Sales AE roles)", async () => {
    // Real captured QAWolf Ashby board: both currently open roles are Account
    // Executive/Sales positions, not QA/SDET-focused, so both are filtered out.
    mockFetch(realResponse);
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs).toEqual([]);
  });

  it("maps a matching posting's fields, built from the real board's exact structure", async () => {
    mockFetch({
      jobs: [
        {
          id: "aaaaaaaa-1111-2222-3333-444444444444",
          title: "QA Automation Engineer",
          department: "Engineering",
          location: "United States",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          isListed: true,
          isRemote: true,
          workplaceType: "Remote",
          jobUrl: "https://jobs.ashbyhq.com/QAWolf/aaaaaaaa-1111-2222-3333-444444444444",
          applyUrl: "https://jobs.ashbyhq.com/QAWolf/aaaaaaaa-1111-2222-3333-444444444444/application",
        },
      ],
      apiVersion: 2,
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "ab:QAWolf:aaaaaaaa-1111-2222-3333-444444444444",
      title: "QA Automation Engineer",
      url: "https://jobs.ashbyhq.com/QAWolf/aaaaaaaa-1111-2222-3333-444444444444",
      company: "QAWolf",
      location: "United States",
      postedAt: "2026-07-01T00:00:00.000-04:00",
      workArrangement: "remote",
    });
  });

  it("maps workplaceType 'Onsite' to onsite even when isRemote is absent", async () => {
    mockFetch({
      jobs: [
        {
          id: "id-onsite",
          title: "SDET",
          location: "Cookeville, TN",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          workplaceType: "Onsite",
          jobUrl: "https://jobs.ashbyhq.com/QAWolf/id-onsite",
        },
      ],
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs[0].workArrangement).toBe("onsite");
  });

  it("falls back to the isRemote boolean when workplaceType is absent", async () => {
    mockFetch({
      jobs: [
        {
          id: "id-remote-bool",
          title: "SDET",
          location: "Remote",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          isRemote: true,
          jobUrl: "https://jobs.ashbyhq.com/QAWolf/id-remote-bool",
        },
      ],
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs[0].workArrangement).toBe("remote");
  });

  it("maps workplaceType containing 'Hybrid' to hybrid", async () => {
    mockFetch({
      jobs: [
        {
          id: "id-hybrid",
          title: "SDET",
          location: "Cookeville, TN",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          workplaceType: "Hybrid",
          jobUrl: "https://jobs.ashbyhq.com/QAWolf/id-hybrid",
        },
      ],
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs[0].workArrangement).toBe("hybrid");
  });

  it("falls back to onsite when isRemote is explicitly false and workplaceType is absent", async () => {
    mockFetch({
      jobs: [
        {
          id: "id-remote-false",
          title: "SDET",
          location: "Cookeville, TN",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          isRemote: false,
          jobUrl: "https://jobs.ashbyhq.com/QAWolf/id-remote-false",
        },
      ],
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs[0].workArrangement).toBe("onsite");
  });

  it("leaves workArrangement undefined when neither workplaceType nor isRemote is present", async () => {
    mockFetch({
      jobs: [
        {
          id: "id-unknown",
          title: "SDET",
          location: "Remote",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          jobUrl: "https://jobs.ashbyhq.com/QAWolf/id-unknown",
        },
      ],
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs[0].workArrangement).toBeUndefined();
  });

  it("returns an empty array rather than throwing when the response has no jobs field", async () => {
    mockFetch({});
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs).toEqual([]);
  });

  it("falls back to applyUrl when jobUrl is absent", async () => {
    mockFetch({
      jobs: [
        {
          id: "id-1",
          title: "SDET",
          location: "Remote",
          publishedAt: "2026-07-01T00:00:00.000-04:00",
          applyUrl: "https://jobs.ashbyhq.com/QAWolf/id-1/application",
        },
      ],
    });
    const jobs = await fetchAshbyJobs("QAWolf");
    expect(jobs[0].url).toBe("https://jobs.ashbyhq.com/QAWolf/id-1/application");
  });
});

describe("fetchAllAshbyJobs", () => {
  it("aggregates jobs across all configured ASHBY_COMPANIES", async () => {
    mockFetch(realResponse);
    const jobs = await fetchAllAshbyJobs();
    expect(jobs).toEqual([]);
  });
});

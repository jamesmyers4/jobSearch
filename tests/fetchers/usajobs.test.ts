import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import {
  fetchUSAJobs,
  fetchAllUSAJobs,
  USAJOBS_PAGE_SIZE,
  USAJOBS_MAX_PAGES,
} from "../../check-jobs.ts";

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

  it("leaves workArrangement undefined when RemoteIndicator is false and JobSummary text gives no signal", async () => {
    mockFetch(realResponse);
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs[0].workArrangement).toBeUndefined();
  });

  it("maps workArrangement to remote when UserArea.Details.RemoteIndicator is true, even if JobSummary text says nothing about it", async () => {
    // RemoteIndicator is a real field on data.usajobs.gov's response (confirmed
    // via a live capture), separate from TeleworkEligible (which just means
    // occasional WFH is allowed, not that the position is remote). Federal
    // JobSummary text almost never contains the literal word "remote" even for
    // genuinely remote positions, so this structured field has to win over the
    // shared extractWorkArrangement text scan, the same way Quarterhill's
    // location_name wins over its description text.
    mockFetch({
      SearchResult: {
        SearchResultItems: [
          {
            MatchedObjectDescriptor: {
              PositionTitle: "Test Automation Engineer",
              PositionID: "REMOTE-TEST-1",
              OrganizationName: "Some Agency",
              PositionLocationDisplay: "Woodlawn, Maryland",
              PositionURI: "https://www.usajobs.gov:443/job/111111",
              PublicationStartDate: "2026-07-01T00:00:00",
              UserArea: {
                Details: {
                  JobSummary: "Join our team building automated test suites.",
                  TeleworkEligible: true,
                  RemoteIndicator: true,
                },
              },
            },
          },
        ],
      },
    });
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs[0].workArrangement).toBe("remote");
  });

  it("falls back to extractWorkArrangement(description) when RemoteIndicator is absent from an older-shaped response", async () => {
    mockFetch({
      SearchResult: {
        SearchResultItems: [
          {
            MatchedObjectDescriptor: {
              PositionTitle: "Test Automation Engineer",
              PositionID: "NO-REMOTE-FIELD-1",
              OrganizationName: "Some Agency",
              PositionLocationDisplay: "Somewhere, USA",
              PositionURI: "https://www.usajobs.gov:443/job/222222",
              PublicationStartDate: "2026-07-01T00:00:00",
              UserArea: {
                Details: {
                  JobSummary: "This is a hybrid role based out of our regional office.",
                },
              },
            },
          },
        ],
      },
    });
    const jobs = await fetchUSAJobs("test automation");
    expect(jobs[0].workArrangement).toBe("hybrid");
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

  function makeUsajobsItem(id: number) {
    return {
      MatchedObjectDescriptor: {
        PositionTitle: "Test Engineer",
        PositionID: `PAGE-TEST-${id}`,
        OrganizationName: "Some Agency",
        PositionLocationDisplay: "Somewhere, USA",
        PositionURI: `https://www.usajobs.gov:443/job/${id}`,
        PublicationStartDate: "2026-07-01T00:00:00",
      },
    };
  }

  it("fetches a second page when the first page comes back full and SearchResultCountAll indicates more results remain", async () => {
    // A single ResultsPerPage=50 call was silently truncating regardless of
    // how many real results existed (a real capture returned
    // SearchResultCountAll: 880 for one keyword).
    const page1 = Array.from({ length: USAJOBS_PAGE_SIZE }, (_, i) => makeUsajobsItem(i));
    const page2 = [makeUsajobsItem(USAJOBS_PAGE_SIZE)];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            SearchResult: { SearchResultCountAll: USAJOBS_PAGE_SIZE + 1, SearchResultItems: page1 },
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            SearchResult: { SearchResultCountAll: USAJOBS_PAGE_SIZE + 1, SearchResultItems: page2 },
          }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await fetchUSAJobs("test automation");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(USAJOBS_PAGE_SIZE + 1);
    expect(fetchMock.mock.calls[0][0]).toContain("Page=1");
    expect(fetchMock.mock.calls[1][0]).toContain("Page=2");
  });

  it("stops fetching once a page comes back short of the page size, even without SearchResultCountAll", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({ SearchResult: { SearchResultItems: [makeUsajobsItem(1)] } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchUSAJobs("test automation");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`never exceeds USAJOBS_MAX_PAGES (${USAJOBS_MAX_PAGES}) even when SearchResultCountAll indicates far more results remain`, async () => {
    const fullPage = Array.from({ length: USAJOBS_PAGE_SIZE }, (_, i) => makeUsajobsItem(i));
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          SearchResult: { SearchResultCountAll: 100000, SearchResultItems: fullPage },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await fetchUSAJobs("test automation");
    expect(fetchMock).toHaveBeenCalledTimes(USAJOBS_MAX_PAGES);
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

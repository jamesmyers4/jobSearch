import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import {
  fetchAdzunaJobs,
  fetchAllAdzunaJobs,
  MAX_ALERT_AGE_DAYS,
  MAX_DRAFT_AGE_DAYS,
  ADZUNA_PAGE_SIZE,
  ADZUNA_MAX_PAGES,
} from "../../check-jobs.ts";

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
      country: "United States",
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

  it("always tags jobs with country: United States, since the query itself is scoped to the /us/ endpoint", async () => {
    mockFetch({
      results: [
        {
          id: "1",
          title: "SDET",
          redirect_url: "https://example.com/1",
          company: { display_name: "Some Co" },
          location: { display_name: "Remote" },
          created: "2026-07-13T10:00:00Z",
        },
      ],
    });
    const jobs = await fetchAdzunaJobs("SDET");
    expect(jobs[0].country).toBe("United States");
  });

  it("queries Adzuna's own max_days_old using the same freshness window as every other source (MAX_ALERT_AGE_DAYS), not the unrelated AI-draft-only MAX_DRAFT_AGE_DAYS", async () => {
    // Adzuna is the only source with a server-side freshness filter baked
    // into the request itself. It previously reused MAX_DRAFT_AGE_DAYS (4) —
    // a constant meant for gating AI-draft spend in main() — which silently
    // narrowed Adzuna's results to a 4-day window while every other source
    // gets the full MAX_ALERT_AGE_DAYS (7) via the local isFreshJob check.
    expect(MAX_DRAFT_AGE_DAYS).not.toBe(MAX_ALERT_AGE_DAYS);
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);
    await fetchAdzunaJobs("SDET");
    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain(`max_days_old=${MAX_ALERT_AGE_DAYS}`);
    expect(requestedUrl).not.toContain(`max_days_old=${MAX_DRAFT_AGE_DAYS}`);
  });

  function makeAdzunaResult(id: number) {
    return {
      id: String(id),
      title: "SDET",
      redirect_url: `https://example.com/${id}`,
      company: { display_name: "Some Co" },
      location: { display_name: "Remote" },
      created: "2026-07-13T10:00:00Z",
    };
  }

  it("fetches a second page when the first page comes back full and count indicates more results remain", async () => {
    // A single-page call was silently truncating to results_per_page
    // regardless of how many real results existed (a real capture returned
    // count: 254 for one title against a 20-per-page cap).
    const page1 = Array.from({ length: ADZUNA_PAGE_SIZE }, (_, i) => makeAdzunaResult(i));
    const page2 = [makeAdzunaResult(ADZUNA_PAGE_SIZE)];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ count: ADZUNA_PAGE_SIZE + 1, results: page1 }) })
      .mockResolvedValueOnce({ json: () => Promise.resolve({ count: ADZUNA_PAGE_SIZE + 1, results: page2 }) });
    vi.stubGlobal("fetch", fetchMock);
    const jobs = await fetchAdzunaJobs("SDET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(ADZUNA_PAGE_SIZE + 1);
    expect(fetchMock.mock.calls[0][0]).toContain("/search/1?");
    expect(fetchMock.mock.calls[1][0]).toContain("/search/2?");
  });

  it("stops fetching once a page comes back short of the page size, even if count wasn't provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({ results: [makeAdzunaResult(1)] }) });
    vi.stubGlobal("fetch", fetchMock);
    await fetchAdzunaJobs("SDET");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`never exceeds ADZUNA_MAX_PAGES (${ADZUNA_MAX_PAGES}) even when count indicates far more results remain`, async () => {
    const fullPage = Array.from({ length: ADZUNA_PAGE_SIZE }, (_, i) => makeAdzunaResult(i));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({ count: 10000, results: fullPage }) });
    vi.stubGlobal("fetch", fetchMock);
    await fetchAdzunaJobs("SDET");
    expect(fetchMock).toHaveBeenCalledTimes(ADZUNA_MAX_PAGES);
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

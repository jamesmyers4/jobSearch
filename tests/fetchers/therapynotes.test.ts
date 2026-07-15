import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchTherapyNotesJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/therapynotes-response.json", "utf-8"),
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

describe("fetchTherapyNotesJobs", () => {
  it("filters out every posting on the real board, since none of its current titles match SEARCH_TITLES", async () => {
    // TherapyNotes is an allowlisted company (AI_DRAFT_COMPANY_ALLOWLIST),
    // which controls which board gets queried — it does not exempt results
    // from matchesAnyTitle. None of the 3 real postings currently on this
    // board ("Senior Quality Assurance Engineer", "Senior Software
    // Developer", "Software Developer") are substring matches for any entry
    // in SEARCH_TITLES, so the filtered result is legitimately empty.
    mockFetch(realResponse);
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs).toEqual([]);
  });

  it("filters out a posting whose title doesn't match SEARCH_TITLES", async () => {
    mockFetch({
      jobs: [
        {
          title: "Office Manager",
          shortcode: "XYZ999",
          url: "https://apply.workable.com/j/XYZ999",
          published_on: "2026-07-01",
          country: "United States",
          city: "",
          state: "",
        },
      ],
    });
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs).toEqual([]);
  });

  it("maps key/url/company correctly and falls back to country when city/state are empty (real board shape has no job.location object)", async () => {
    // The real Workable widget response has no `location` object on the job
    // at all — city/state/country are top-level fields instead, and can be
    // empty strings (as in the real fixture's first job).
    mockFetch({
      jobs: [
        {
          title: "Senior QA Engineer",
          shortcode: "5CBA95131B",
          url: "https://apply.workable.com/j/5CBA95131B",
          published_on: "2026-07-13",
          country: "United States",
          city: "",
          state: "",
        },
      ],
    });
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs[0]).toMatchObject({
      key: "tn:5CBA95131B",
      title: "Senior QA Engineer",
      url: "https://apply.workable.com/j/5CBA95131B",
      company: "TherapyNotes",
      location: "United States",
      postedAt: "2026-07-13",
    });
  });

  it("joins city and state into location when both are present", async () => {
    mockFetch({
      jobs: [
        {
          title: "Senior Software Test Engineer",
          shortcode: "3E9C73C159",
          url: "https://apply.workable.com/j/3E9C73C159",
          published_on: "2026-07-07",
          country: "United States",
          city: "Philadelphia",
          state: "Pennsylvania",
        },
      ],
    });
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs[0].location).toBe("Philadelphia, Pennsylvania");
  });

  it("falls back to created_at when published_on is missing", async () => {
    mockFetch({
      jobs: [
        {
          title: "QA Engineer",
          shortcode: "ABC123",
          url: "https://apply.workable.com/j/ABC123",
          published_on: null,
          created_at: "2026-05-01",
        },
      ],
    });
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs[0].postedAt).toBe("2026-05-01");
  });

  it("returns an empty array rather than throwing when the response has no jobs field", async () => {
    mockFetch({});
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs).toEqual([]);
  });
});

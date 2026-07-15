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
  it("maps every posting on the real board, including non-QA titles (this source has no matchesAnyTitle filter)", async () => {
    // Unlike every other fetcher, fetchTherapyNotesJobs doesn't call
    // matchesAnyTitle at all — TherapyNotes is an explicitly allowlisted
    // company (AI_DRAFT_COMPANY_ALLOWLIST), so all 3 real postings come
    // through, including "Senior Software Developer".
    mockFetch(realResponse);
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs).toHaveLength(3);
    expect(jobs.map((j) => j.title)).toEqual([
      "Senior Quality Assurance Engineer",
      "Senior Software Developer",
      "Software Developer",
    ]);
  });

  it("maps key/url/company correctly and leaves location undefined (real board has no job.location field)", async () => {
    // fetchTherapyNotesJobs reads job.location?.location_str, but the real
    // Workable widget response has no `location` object on the job at all
    // (city/state/country are top-level instead) — so location is always
    // undefined for this source as currently written.
    mockFetch(realResponse);
    const jobs = await fetchTherapyNotesJobs();
    expect(jobs[0]).toMatchObject({
      key: "tn:5CBA95131B",
      title: "Senior Quality Assurance Engineer",
      url: "https://apply.workable.com/j/5CBA95131B",
      company: "TherapyNotes",
      location: undefined,
      postedAt: "2026-07-13",
    });
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
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchLeverJobs, fetchAllLeverJobs } from "../../check-jobs.ts";

// LEVER_COMPANIES is currently empty in check-jobs.ts, so no live Lever board
// is configured to capture a real response from. This fixture is built from
// Lever's documented public postings API shape (id/text/hostedUrl/categories/
// createdAt) — the same field names fetchLeverJobs already expects — rather
// than invented field names. Revisit with a real capture if a company is
// ever added to LEVER_COMPANIES.
const sampleResponse = JSON.parse(
  readFileSync("tests/fixtures/lever-response.json", "utf-8"),
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

describe("fetchLeverJobs", () => {
  it("keeps a matching Test Automation Engineer posting and drops a non-matching Account Executive posting", async () => {
    mockFetch(sampleResponse);
    const jobs = await fetchLeverJobs("example-co");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "lv:example-co:3f8a1c2d-0000-4444-8888-abcdef123456",
      title: "Test Automation Engineer",
      url: "https://jobs.lever.co/example-co/3f8a1c2d-0000-4444-8888-abcdef123456",
      company: "example-co",
      location: "Remote - US",
      postedAt: 1783991631000,
      workArrangement: "remote",
    });
  });

  it("returns an empty array when the response isn't an array (Lever returns an error object for an unknown board)", async () => {
    mockFetch({ ok: false, error: "Document not found" });
    const jobs = await fetchLeverJobs("nonexistent-co");
    expect(jobs).toEqual([]);
  });

  it("maps workplaceType into workArrangement (hybrid/on-site cases), per Lever's documented postings API shape", async () => {
    // LEVER_COMPANIES is empty today (no live board configured), so this is
    // built from Lever's documented public postings API field names, same
    // as the rest of this fixture — not a live capture. Revisit with a real
    // capture if a company is ever added to LEVER_COMPANIES.
    mockFetch([
      {
        id: "hybrid-job",
        text: "SDET",
        categories: { location: "Chicago, IL" },
        workplaceType: "hybrid",
        hostedUrl: "https://jobs.lever.co/example-co/hybrid-job",
        createdAt: 1783991631000,
      },
      {
        id: "onsite-job",
        text: "SDET",
        categories: { location: "Chicago, IL" },
        workplaceType: "on-site",
        hostedUrl: "https://jobs.lever.co/example-co/onsite-job",
        createdAt: 1783991631000,
      },
    ]);
    const jobs = await fetchLeverJobs("example-co");
    expect(jobs[0].workArrangement).toBe("hybrid");
    expect(jobs[1].workArrangement).toBe("onsite");
  });
});

describe("fetchAllLeverJobs", () => {
  it("returns an empty array since LEVER_COMPANIES is currently empty", async () => {
    mockFetch(sampleResponse);
    const jobs = await fetchAllLeverJobs();
    expect(jobs).toEqual([]);
  });
});

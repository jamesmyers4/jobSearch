import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchRemoteOKJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/remoteok-response.json", "utf-8"),
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

describe("fetchRemoteOKJobs", () => {
  it("skips the legal-notice metadata object and filters out real non-matching postings", async () => {
    // RemoteOK's real API always prepends a metadata object with no id/position
    // (just `last_updated`/`legal`) before the actual job listings — the
    // `item.id && item.position` guard exists specifically to skip it. Neither
    // of the two real postings captured here ("Online Tutoring", "Create Your
    // Own") matches SEARCH_TITLES, so the result should be empty.
    mockFetch(realResponse);
    const jobs = await fetchRemoteOKJobs();
    expect(jobs).toEqual([]);
  });

  it("maps a matching posting's fields correctly", async () => {
    mockFetch([
      { last_updated: 123, legal: "..." },
      {
        id: "999999",
        epoch: 1783991631,
        date: "2026-07-13T21:13:51-04:00",
        company: "Remote QA Co",
        position: "QA Automation Engineer",
        tags: ["qa", "automation"],
        location: "Worldwide",
        url: "https://remoteOK.com/remote-jobs/qa-automation-engineer-999999",
        salary_min: 0,
        salary_max: 0,
      },
    ]);
    const jobs = await fetchRemoteOKJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "rok:999999",
      title: "QA Automation Engineer",
      url: "https://remoteOK.com/remote-jobs/qa-automation-engineer-999999",
      company: "Remote QA Co",
      location: "Worldwide",
      postedAt: "2026-07-13T21:13:51-04:00",
    });
  });

  it("falls back to epoch when date is absent, converting Unix seconds to milliseconds", async () => {
    // job.epoch is Unix seconds; daysOld/daysAgoLabel call `new Date(n)`,
    // which always treats a numeric argument as milliseconds. Passing the
    // raw seconds value through would land the computed date near 1970 and
    // silently drop the posting as stale. Converting at this call site keeps
    // daysOld/daysAgoLabel themselves untouched, since every other source
    // already passes a proper ISO date string through them.
    mockFetch([
      {
        id: "888888",
        epoch: 1783991631,
        company: "Remote QA Co",
        position: "SDET",
        url: "https://remoteOK.com/remote-jobs/sdet-888888",
      },
    ]);
    const jobs = await fetchRemoteOKJobs();
    expect(jobs[0].postedAt).toBe(1783991631000);
  });

  it("returns an empty array rather than throwing when RemoteOK returns a non-array error object (e.g. rate limiting)", async () => {
    mockFetch({ error: "Too many requests" });
    const jobs = await fetchRemoteOKJobs();
    expect(jobs).toEqual([]);
  });
});

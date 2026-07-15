import { describe, it, expect } from "vitest";
import { daysOld, daysAgoLabel } from "../../check-jobs.ts";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

describe("daysOld", () => {
  it("returns Infinity when postedAt is absent", () => {
    expect(daysOld(undefined)).toBe(Infinity);
  });

  it("returns Infinity for an unparseable date", () => {
    expect(daysOld("not a date")).toBe(Infinity);
  });

  it("returns 0 for a date posted today", () => {
    expect(daysOld(daysAgo(0))).toBe(0);
  });

  it("returns the correct day count for a date posted several days ago", () => {
    expect(daysOld(daysAgo(5))).toBe(5);
  });

  it("still treats a bare numeric postedAt as milliseconds (fetchRemoteOKJobs converts epoch-seconds to ms before this is ever called)", () => {
    // daysOld itself always treats a numeric argument as milliseconds via
    // `new Date(n)` — that's unchanged, since every other source already
    // passes a proper ISO date string through it. The fix for RemoteOK's
    // Unix-seconds `job.epoch` fallback lives at the fetchRemoteOKJobs call
    // site instead (see tests/fetchers/remoteok.test.ts), converting to
    // milliseconds before it ever reaches daysOld/daysAgoLabel.
    const msToday = Date.now();
    expect(daysOld(msToday)).toBe(0);
  });
});

describe("daysAgoLabel", () => {
  it("labels an absent postedAt as unknown", () => {
    expect(daysAgoLabel(undefined)).toBe("posted date unknown");
  });

  it("labels an unparseable date as unknown", () => {
    expect(daysAgoLabel("not a date")).toBe("posted date unknown");
  });

  it("labels a date posted today", () => {
    expect(daysAgoLabel(daysAgo(0))).toBe("posted today");
  });

  it("labels a date posted 1 day ago with singular phrasing", () => {
    expect(daysAgoLabel(daysAgo(1))).toBe("posted 1 day ago");
  });

  it("labels a date posted several days ago with plural phrasing", () => {
    expect(daysAgoLabel(daysAgo(5))).toBe("posted 5 days ago");
  });
});

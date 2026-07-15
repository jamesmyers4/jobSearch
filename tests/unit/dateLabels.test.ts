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

  it("misinterprets a RemoteOK-style epoch-seconds postedAt as milliseconds, producing a huge day count instead of the real one", () => {
    // fetchRemoteOKJobs falls back to `job.epoch` (Unix seconds, e.g. the real
    // captured value 1783991631) when `job.date` is absent. `new Date(n)`
    // always treats a numeric argument as milliseconds, so this lands near
    // the 1970 epoch instead of 2026 — daysOld comes back enormous rather
    // than the ~0 days old the posting actually is. Documenting this real
    // quirk rather than silently "fixing" it here.
    const epochSecondsToday = Math.floor(Date.now() / 1000);
    const result = daysOld(epochSecondsToday);
    expect(result).toBeGreaterThan(1000);
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

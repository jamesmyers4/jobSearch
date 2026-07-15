import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadDigestState, saveDigestState, isDigestSource, type JobPosting } from "../../check-jobs.ts";

// loadDigestState/saveDigestState always read/write "digest-state.json"
// relative to process.cwd() — same temp-cwd pattern as tests/state/tracker.test.ts.
// NOTE: this file only covers the persistence functions themselves. The
// queue/interval *decision* logic (the "first digest job starts the clock
// without sending immediately" behavior, the hoursSinceDigest >= DIGEST_INTERVAL_HOURS
// check) lives inline in main(), not in a standalone testable function — that
// belongs to the full main()-level integration test, not this layer.
let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "jobsearch-digeststate-test-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "az:1", title: "Quality Engineer", url: "https://example.com/1", ...overrides };
}

describe("digest-state.json persistence", () => {
  it("returns an empty queue and no lastSentAt when the file doesn't exist yet", () => {
    expect(loadDigestState()).toEqual({ queue: [] });
  });

  it("round-trips a queue and lastSentAt through save and load", () => {
    const job = makeJob({});
    saveDigestState({ lastSentAt: "2026-07-14T00:00:00.000Z", queue: [job] });
    expect(loadDigestState()).toEqual({
      lastSentAt: "2026-07-14T00:00:00.000Z",
      queue: [job],
    });
  });

  it("round-trips an empty queue alongside a set lastSentAt", () => {
    saveDigestState({ lastSentAt: "2026-07-14T00:00:00.000Z", queue: [] });
    expect(loadDigestState()).toEqual({ lastSentAt: "2026-07-14T00:00:00.000Z", queue: [] });
  });
});

describe("isDigestSource", () => {
  it("treats RemoteOK and Adzuna postings as digest sources", () => {
    expect(isDigestSource(makeJob({ key: "rok:1" }))).toBe(true);
    expect(isDigestSource(makeJob({ key: "az:1" }))).toBe(true);
  });

  it("treats every other source as an immediate (non-digest) source", () => {
    expect(isDigestSource(makeJob({ key: "tn:1" }))).toBe(false);
    expect(isDigestSource(makeJob({ key: "wk:1" }))).toBe(false);
    expect(isDigestSource(makeJob({ key: "usaj:1" }))).toBe(false);
  });
});

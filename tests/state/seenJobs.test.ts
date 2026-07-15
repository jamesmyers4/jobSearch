import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadSeenJobs, saveSeenJobs } from "../../check-jobs.ts";

// loadSeenJobs/saveSeenJobs always read/write "seen-jobs.json" relative to
// process.cwd() — same pattern as tests/state/tracker.test.ts: run each test
// inside its own temp directory as CWD against the real fs functions.
let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "jobsearch-seenjobs-test-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

describe("seen-jobs.json persistence", () => {
  it("reports isFirstRun true and an empty set when the file doesn't exist yet", () => {
    const { seen, isFirstRun } = loadSeenJobs();
    expect(isFirstRun).toBe(true);
    expect(seen.size).toBe(0);
  });

  it("round-trips a set of job keys through save and load", () => {
    saveSeenJobs(new Set(["tn:1", "wk:2", "az:3"]));
    const { seen, isFirstRun } = loadSeenJobs();
    expect(isFirstRun).toBe(false);
    expect(seen).toEqual(new Set(["tn:1", "wk:2", "az:3"]));
  });

  it("preserves an empty seen set on disk as isFirstRun false, not true", () => {
    // An empty array is still valid JSON on disk — the file existing at all
    // (even with zero entries) is what flips isFirstRun to false, not the
    // set's size.
    saveSeenJobs(new Set());
    const { seen, isFirstRun } = loadSeenJobs();
    expect(isFirstRun).toBe(false);
    expect(seen.size).toBe(0);
  });
});

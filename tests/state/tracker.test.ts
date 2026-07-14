import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadTracker, saveTracker, recordAlerts, type JobPosting } from "../../check-jobs.ts";

// loadTracker/saveTracker always read/write "application-tracker.json" relative
// to process.cwd() — there's no injectable path. To test the real functions
// against a real file without touching the actual repo state, each test runs
// inside its own temp directory as CWD.
let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "jobsearch-tracker-test-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

describe("application-tracker.json persistence", () => {
  it("returns an empty object when the file doesn't exist yet", () => {
    expect(loadTracker()).toEqual({});
  });

  it("round-trips through save and load", () => {
    saveTracker({ "wk:1": { title: "SDET", alertedAt: "2026-07-14T00:00:00.000Z" } });
    expect(loadTracker()).toEqual({
      "wk:1": { title: "SDET", alertedAt: "2026-07-14T00:00:00.000Z" },
    });
  });

  it("recordAlerts adds a new entry but never overwrites an existing alertedAt", () => {
    const job: JobPosting = { key: "wk:1", title: "SDET", url: "https://x/1", company: "Acme" };
    recordAlerts([job]);
    const firstAlertedAt = loadTracker()["wk:1"].alertedAt;

    // Simulate the same job somehow being passed to recordAlerts again later —
    // the original alertedAt timestamp must survive untouched.
    recordAlerts([job]);
    expect(loadTracker()["wk:1"].alertedAt).toBe(firstAlertedAt);
  });
});

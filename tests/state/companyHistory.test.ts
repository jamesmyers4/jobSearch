import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadCompanyHistory } from "../../check-jobs.ts";

// loadCompanyHistory reads "company-history.json" relative to process.cwd() —
// same temp-cwd pattern as tests/state/tracker.test.ts. Note this is
// deliberately separate from the module-load-time COMPANY_HISTORY constant
// (which scoreJob/historyStatus/the email tests lean on against the real repo
// file) — this file tests the loader function itself against controlled input.
let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "jobsearch-companyhistory-test-"));
  process.chdir(tempDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

describe("loadCompanyHistory", () => {
  it("returns an empty map when the file doesn't exist", () => {
    expect(loadCompanyHistory()).toEqual(new Map());
  });

  it("returns an empty map when the file contains invalid JSON", () => {
    writeFileSync("company-history.json", "not valid json{");
    expect(loadCompanyHistory()).toEqual(new Map());
  });

  it("lowercases every company name key while preserving the status value", () => {
    writeFileSync(
      "company-history.json",
      JSON.stringify({ "Golden Pet Brands": "rejected", "Acme Health": "active" }),
    );
    const history = loadCompanyHistory();
    expect(history.get("golden pet brands")).toBe("rejected");
    expect(history.get("acme health")).toBe("active");
    expect(history.has("Golden Pet Brands")).toBe(false);
  });

  it("round-trips multiple entries correctly", () => {
    writeFileSync(
      "company-history.json",
      JSON.stringify({ "Company A": "applied", "Company B": "interviewing", "Company C": "rejected" }),
    );
    const history = loadCompanyHistory();
    expect(history.size).toBe(3);
    expect([...history.entries()]).toEqual([
      ["company a", "applied"],
      ["company b", "interviewing"],
      ["company c", "rejected"],
    ]);
  });
});

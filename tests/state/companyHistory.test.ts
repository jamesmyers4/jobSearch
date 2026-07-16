import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadCompanyHistory, type CompanyHistory } from "../../check-jobs.ts";

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

function entry(overrides: Partial<CompanyHistory[string]>): CompanyHistory[string] {
  return {
    displayName: "Acme Health",
    aliases: [],
    applications: [],
    reapplyInvited: null,
    status: "active",
    statusReason: "",
    lastUpdated: "2026-07-16",
    ...overrides,
  };
}

describe("loadCompanyHistory", () => {
  it("returns an empty map when the file doesn't exist", () => {
    expect(loadCompanyHistory()).toEqual(new Map());
  });

  it("returns an empty map when the file contains invalid JSON", () => {
    writeFileSync("company-history.json", "not valid json{");
    expect(loadCompanyHistory()).toEqual(new Map());
  });

  it("indexes an entry under its lowercased displayName", () => {
    writeFileSync(
      "company-history.json",
      JSON.stringify({ "acme-health": entry({ displayName: "Acme Health", status: "caution" }) }),
    );
    const history = loadCompanyHistory();
    expect(history.get("acme health")?.status).toBe("caution");
    expect(history.has("Acme Health")).toBe(false);
  });

  it("also indexes an entry under each of its lowercased aliases", () => {
    writeFileSync(
      "company-history.json",
      JSON.stringify({
        "acme-health": entry({
          displayName: "Acme Health",
          aliases: ["Acme Health Systems", "AHS"],
          status: "blocked",
        }),
      }),
    );
    const history = loadCompanyHistory();
    expect(history.get("acme health")?.status).toBe("blocked");
    expect(history.get("acme health systems")?.status).toBe("blocked");
    expect(history.get("ahs")?.status).toBe("blocked");
  });

  it("round-trips multiple entries with distinct statuses correctly", () => {
    writeFileSync(
      "company-history.json",
      JSON.stringify({
        a: entry({ displayName: "Company A", status: "active" }),
        b: entry({ displayName: "Company B", status: "caution" }),
        c: entry({ displayName: "Company C", status: "blocked" }),
      }),
    );
    const history = loadCompanyHistory();
    expect(history.size).toBe(3);
    expect(history.get("company a")?.status).toBe("active");
    expect(history.get("company b")?.status).toBe("caution");
    expect(history.get("company c")?.status).toBe("blocked");
  });
});

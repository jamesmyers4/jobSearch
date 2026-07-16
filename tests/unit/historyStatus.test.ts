import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { historyStatus } from "../../check-jobs.ts";
import type { CompanyHistory } from "../../check-jobs.ts";

// company-history.json in the repo root currently marks both "Golden Pet
// Brands" and "TherapyNotes" as "active" — deliberately, since real-history
// entries with a reapply invitation or an ambiguous single rejection stay
// active until a second, clearer signal comes in. Those cases are covered
// here against the real file, since historyStatus() reads the module-load-time
// COMPANY_HISTORY map directly.
//
// "caution" and "blocked" have no real example in the repo file today (there's
// nothing in real history that warrants either yet), so those branches are
// exercised against a synthetic file in an isolated temp cwd + a fresh module
// import — COMPANY_HISTORY is only read once, at import time, so a plain
// process.chdir() after check-jobs.ts is already loaded wouldn't pick up a
// different file. Mirrors the vi.resetModules() + dynamic import pattern from
// tests/integration/main-ai-pipeline.test.ts.

describe("historyStatus (real repo data)", () => {
  it("returns undefined when company is absent", () => {
    expect(historyStatus(undefined)).toBeUndefined();
  });

  it("returns undefined for a company with no history entry", () => {
    expect(historyStatus("A Company With No History")).toBeUndefined();
  });

  it("finds a real active entry via case-insensitive exact match", () => {
    expect(historyStatus("Golden Pet Brands")).toBe("active");
    expect(historyStatus("golden pet brands")).toBe("active");
  });

  it("finds a real active entry via substring match against a longer company name", () => {
    expect(historyStatus("Golden Pet Brands, Inc.")).toBe("active");
  });

  it("matches on an alias, not just the displayName", () => {
    expect(historyStatus("GPB")).toBe("active");
  });
});

describe("historyStatus (synthetic caution/blocked data)", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = mkdtempSync(join(tmpdir(), "jobsearch-historystatus-test-"));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("returns 'caution' for a company flagged caution", async () => {
    const history: CompanyHistory = {
      "flaky-corp": {
        displayName: "Flaky Corp",
        aliases: [],
        applications: [],
        reapplyInvited: null,
        status: "caution",
        statusReason: "Ghosted after a panel round once.",
        lastUpdated: "2026-07-16",
      },
    };
    writeFileSync("company-history.json", JSON.stringify(history));
    const fresh = await import("../../check-jobs.ts");
    expect(fresh.historyStatus("Flaky Corp")).toBe("caution");
  });

  it("returns 'blocked' for a company flagged blocked", async () => {
    const history: CompanyHistory = {
      "bad-actor-inc": {
        displayName: "Bad Actor Inc",
        aliases: ["Bad Actor"],
        applications: [],
        reapplyInvited: false,
        status: "blocked",
        statusReason: "Explicitly asked not to be contacted again.",
        lastUpdated: "2026-07-16",
      },
    };
    writeFileSync("company-history.json", JSON.stringify(history));
    const fresh = await import("../../check-jobs.ts");
    expect(fresh.historyStatus("Bad Actor")).toBe("blocked");
  });
});

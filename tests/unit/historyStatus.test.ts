import { describe, it, expect } from "vitest";
import { historyStatus } from "../../check-jobs.ts";

describe("historyStatus", () => {
  // company-history.json in the repo root marks "Golden Pet Brands" as
  // rejected — this test relies on that real file, not a mock, since
  // historyStatus() reads the module-load-time COMPANY_HISTORY map directly.

  it("returns undefined when company is absent", () => {
    expect(historyStatus(undefined)).toBeUndefined();
  });

  it("returns undefined for a company with no history entry", () => {
    expect(historyStatus("A Company With No History")).toBeUndefined();
  });

  it("finds a real rejected entry via case-insensitive exact match", () => {
    expect(historyStatus("Golden Pet Brands")).toBe("rejected");
    expect(historyStatus("golden pet brands")).toBe("rejected");
  });

  it("finds a real rejected entry via substring match against a longer company name", () => {
    expect(historyStatus("Golden Pet Brands, Inc.")).toBe("rejected");
  });
});

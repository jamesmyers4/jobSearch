import { describe, it, expect } from "vitest";
import { formatSalaryRange } from "../../check-jobs.ts";

describe("formatSalaryRange", () => {
  it("returns undefined when both min and max are absent", () => {
    expect(formatSalaryRange(undefined, undefined)).toBeUndefined();
  });

  it("formats a full min-max range with a comma-separated thousands and an en dash", () => {
    expect(formatSalaryRange(90000, 120000)).toBe("$90,000–$120,000");
  });

  it("formats a min-only range with a trailing +", () => {
    expect(formatSalaryRange(90000, undefined)).toBe("$90,000+");
  });

  it("formats a max-only range with an 'up to' prefix", () => {
    expect(formatSalaryRange(undefined, 120000)).toBe("up to $120,000");
  });

  it("rounds fractional values", () => {
    expect(formatSalaryRange(90000.6, 120000.4)).toBe("$90,001–$120,000");
  });

  it("converts a 'Per X' interval into a '/X' suffix", () => {
    expect(formatSalaryRange(90000, 120000, "Per Year")).toBe("$90,000–$120,000 /Year");
  });

  it("leaves an interval that doesn't match the 'Per X' pattern unconverted", () => {
    expect(formatSalaryRange(90000, 120000, "PA")).toBe("$90,000–$120,000 PA");
  });

  it("adds no suffix when interval is omitted", () => {
    expect(formatSalaryRange(90000, 120000, undefined)).toBe("$90,000–$120,000");
  });
});

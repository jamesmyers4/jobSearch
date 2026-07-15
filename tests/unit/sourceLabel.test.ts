import { describe, it, expect } from "vitest";
import { sourceLabel } from "../../check-jobs.ts";

describe("sourceLabel", () => {
  it.each([
    ["tn:123", "TherapyNotes"],
    ["wk:123", "Workable"],
    ["gh:impiricus:1", "Greenhouse"],
    ["lv:example:1", "Lever"],
    ["ab:QAWolf:1", "Ashby"],
    ["soltech:abc", "SOLTECH"],
    ["statheros:/jobs/1", "Statheros"],
    ["qh:1491", "Quarterhill"],
    ["rok:123", "RemoteOK"],
    ["az:123", "Adzuna"],
    ["usaj:123", "USAJOBS"],
  ])("maps key prefix %s to %s", (key, expected) => {
    expect(sourceLabel(key)).toBe(expected);
  });

  it("falls back to the raw prefix for an unrecognized source", () => {
    expect(sourceLabel("mystery:123")).toBe("mystery");
  });
});

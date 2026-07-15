import { describe, it, expect } from "vitest";
import { extractWorkArrangement } from "../../check-jobs.ts";

describe("extractWorkArrangement", () => {
  it("returns undefined when description is absent", () => {
    expect(extractWorkArrangement(undefined)).toBeUndefined();
  });

  it("returns undefined when no arrangement is mentioned", () => {
    expect(extractWorkArrangement("We are a fast-growing startup.")).toBeUndefined();
  });

  it("detects hybrid", () => {
    expect(extractWorkArrangement("This is a hybrid role requiring 3 days in office.")).toBe("hybrid");
  });

  it("detects onsite via 'on-site'", () => {
    expect(extractWorkArrangement("This is an on-site position in Atlanta.")).toBe("onsite");
  });

  it("detects onsite via 'in-office'", () => {
    expect(extractWorkArrangement("Candidates must work in-office five days a week.")).toBe("onsite");
  });

  it("detects remote via 'fully remote'", () => {
    expect(extractWorkArrangement("This is a fully remote position.")).toBe("remote");
  });

  it("detects remote via a bare 'remote' mention", () => {
    expect(extractWorkArrangement("Remote candidates welcome to apply.")).toBe("remote");
  });

  it("prioritizes hybrid over remote when both are mentioned", () => {
    const text = "This role is remote-friendly but currently runs as a hybrid schedule.";
    expect(extractWorkArrangement(text)).toBe("hybrid");
  });

  it("prioritizes onsite over remote when both are mentioned", () => {
    const text = "This is an on-site role; remote work is not available for this position.";
    expect(extractWorkArrangement(text)).toBe("onsite");
  });
});

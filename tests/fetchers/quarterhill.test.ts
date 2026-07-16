import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchQuarterhillJobs } from "../../check-jobs.ts";

const realResponse = JSON.parse(
  readFileSync("tests/fixtures/quarterhill-response.json", "utf-8"),
);

function mockFetch(json: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: () => Promise.resolve(json) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchQuarterhillJobs", () => {
  it("correctly filters out real postings that don't match SEARCH_TITLES (PMO, field tech, electrician roles)", async () => {
    // This is the actual response captured from Quarterhill's internal jobs
    // API. At capture time none of the open roles were QA/SDET-focused, so
    // all three should be filtered out by matchesAnyTitle on genuinely real data.
    mockFetch(realResponse);
    const jobs = await fetchQuarterhillJobs();
    expect(jobs).toEqual([]);
  });

  it("maps a matching posting's fields, including a formatted salary range with no interval suffix", async () => {
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9001",
            title: "QA Automation Engineer",
            location_name: "Remote - US",
            posted_date: "2026-07-10T12:00:00+0000",
            canonical_url: "https://careers.quarterhill.com/jobs/9001?lang=en-us",
            apply_url: "https://careers-quarterhill.icims.com/jobs/9001/login",
            salary_min_value: 90000,
            salary_max_value: 120000,
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "qh:9001",
      title: "QA Automation Engineer",
      url: "https://careers.quarterhill.com/jobs/9001?lang=en-us",
      company: "Quarterhill",
      location: "Remote - US",
      postedAt: "2026-07-10T12:00:00+0000",
      salaryRange: "$90,000–$120,000",
    });
  });

  it("falls back to apply_url and leaves salaryRange undefined when values are zero", async () => {
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9002",
            title: "Senior Test Automation Engineer",
            location_name: "QH Frisco",
            posted_date: "2026-07-11T12:00:00+0000",
            canonical_url: undefined,
            apply_url: "https://careers-quarterhill.icims.com/jobs/9002/login",
            salary_min_value: 0,
            salary_max_value: 0,
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs[0].url).toBe("https://careers-quarterhill.icims.com/jobs/9002/login");
    expect(jobs[0].salaryRange).toBeUndefined();
  });

  it("returns an empty array rather than throwing when the response has no jobs field", async () => {
    mockFetch({});
    const jobs = await fetchQuarterhillJobs();
    expect(jobs).toEqual([]);
  });

  it("prefers location_name's own remote signal over extractWorkArrangement(description), avoiding a real false-positive", async () => {
    // A real live capture (2026-07-15) of Quarterhill's "ITS Field
    // Technician - New Jersey" posting — location_name: "Remote - US" —
    // has a description whose real text contains both "onsite" ("...
    // acceptance onsite...") and "remote" ("...travel to/from various
    // remote locations..."), talking about field-site travel, not work
    // arrangement. extractWorkArrangement checks onsite before remote, so
    // running it on this description alone would misclassify a job
    // Quarterhill's own location_name explicitly marks remote as "onsite" —
    // and isRemoteJob would then silently drop it. location_name must win.
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9010",
            title: "QA Automation Engineer",
            location_name: "Remote - US",
            posted_date: "2026-07-10T12:00:00+0000",
            canonical_url: "https://careers.quarterhill.com/jobs/9010?lang=en-us",
            description:
              "testing phase through to completion and acceptance onsite</span><span class=\"size\"><br /></span></span></li><li><span style=\"font-size: 10pt;\"><span class=\"size\">Will be required to work in all weather conditions, travel to/from various remote locations, and may be required to work at heights</span></span></li></ul><p ",
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs[0].workArrangement).toBe("remote");
  });

  it("falls back to extractWorkArrangement(description) when location_name has no remote signal", async () => {
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9011",
            title: "QA Automation Engineer",
            location_name: "QH Frisco",
            posted_date: "2026-07-10T12:00:00+0000",
            canonical_url: "https://careers.quarterhill.com/jobs/9011?lang=en-us",
            description: "This is a hybrid role based out of our Frisco office.",
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs[0].workArrangement).toBe("hybrid");
  });

  it("extracts yearsRequired from the real description field, now that it's captured", async () => {
    // "5 years of experience in quality control or quality assurance" is a
    // real excerpt pattern from Quarterhill's real live descriptions (seen
    // on the real "Lead, PMO Quality" posting); description was previously
    // never captured at all, so yearsRequired always came back undefined.
    mockFetch({
      jobs: [
        {
          data: {
            slug: "9012",
            title: "QA Automation Engineer",
            location_name: "QH Frisco",
            posted_date: "2026-07-10T12:00:00+0000",
            canonical_url: "https://careers.quarterhill.com/jobs/9012?lang=en-us",
            description:
              "Requires a minimum of 5 years of experience in quality assurance.",
          },
        },
      ],
    });
    const jobs = await fetchQuarterhillJobs();
    expect(jobs[0].yearsRequired).toBe("5 years of experience");
  });
});

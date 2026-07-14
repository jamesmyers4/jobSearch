import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchStatherosJobs } from "../../check-jobs.ts";

const realPageHtml = readFileSync("tests/fixtures/statheros-page.html", "utf-8");

function mockFetchOnce(body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ text: () => Promise.resolve(body) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchStatherosJobs", () => {
  it("correctly filters out a real posting that doesn't match SEARCH_TITLES (AI Engineer role)", async () => {
    // This is the actual HTML captured from statheros.freshteam.com/jobs.
    // At capture time the only open role was an AI Engineer position, which
    // shouldn't match a QA/SDET-focused title search — proving the filter
    // works correctly on genuinely real data, not just a contrived fixture.
    mockFetchOnce(realPageHtml);
    const jobs = await fetchStatherosJobs();
    expect(jobs).toEqual([]);
  });

  it("extracts title, url, location, and remote status from a matching QA posting", async () => {
    // Synthetic block, but built from the exact real markup structure/attributes
    // captured in the fixture above — same data-portal-* pattern, different content.
    const html = `<a href="/jobs/xyz1/qa-automation-engineer-remote" class="heading" data-portal-location="Cookeville, United States of America" data-portal-remote-location=true>
      <div class="job-title">QA Automation Engineer (Remote)</div>
      <div  class="job-desc text">Requires 5+ years of experience in test automation.</div>
    </a>`;
    mockFetchOnce(html);
    const jobs = await fetchStatherosJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "statheros:/jobs/xyz1/qa-automation-engineer-remote",
      title: "QA Automation Engineer (Remote)",
      url: "https://statheros.freshteam.com/jobs/xyz1/qa-automation-engineer-remote",
      company: "Statheros",
      location: "Cookeville, United States of America",
      workArrangement: "remote",
    });
  });

  it("marks a posting onsite when the structured flag says so, even if the title mentions remote", async () => {
    const html = `<a href="/jobs/adv1/it-support" class="heading" data-portal-location="Cookeville, TN" data-portal-remote-location=false>
      <div class="job-title">QA Engineer for Remote Teams</div>
    </a>`;
    mockFetchOnce(html);
    const jobs = await fetchStatherosJobs();
    expect(jobs[0].workArrangement).toBe("onsite");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fetchSoltechJobs } from "../../check-jobs.ts";

const realFeedXml = readFileSync("tests/fixtures/soltech-feed.xml", "utf-8");

function mockFetchText(body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ text: () => Promise.resolve(body) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSoltechJobs", () => {
  it("correctly filters out a real posting that doesn't match SEARCH_TITLES (Solution Architect role)", async () => {
    // This is the actual RSS feed captured from soltech.hire.trakstar.com —
    // at capture time the only open role was Solution Architect, which
    // shouldn't match a QA/SDET title search.
    mockFetchText(realFeedXml);
    const jobs = await fetchSoltechJobs();
    expect(jobs).toEqual([]);
  });

  it("extracts title, url, guid, and description from a matching item using the real RSS structure", async () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><item><title>QA Automation Engineer</title><link>http://soltech.hire.trakstar.com/jobs/abc123</link><description>&lt;p&gt;Requires 4+ years of experience in test automation.&lt;/p&gt;</description><pubDate>Mon, 13 Jul 2026 00:00:00 +0000</pubDate><guid>http://soltech.hire.trakstar.com/jobs/abc123</guid></item></channel></rss>`;
    mockFetchText(xml);
    const jobs = await fetchSoltechJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      key: "soltech:http://soltech.hire.trakstar.com/jobs/abc123",
      title: "QA Automation Engineer",
      url: "http://soltech.hire.trakstar.com/jobs/abc123",
      company: "SOLTECH",
      postedAt: "Mon, 13 Jul 2026 00:00:00 +0000",
    });
    expect(jobs[0].description).toContain("Requires 4+ years of experience in test automation.");
  });

  it("falls back to the link as the dedupe key when guid is missing", async () => {
    const xml = `<item><title>SDET</title><link>http://soltech.hire.trakstar.com/jobs/no-guid</link><description>Test</description></item>`;
    mockFetchText(xml);
    const jobs = await fetchSoltechJobs();
    expect(jobs[0].key).toBe("soltech:http://soltech.hire.trakstar.com/jobs/no-guid");
  });
});

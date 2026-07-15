import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { main } from "../../check-jobs.ts";

// The full main()-level integration test: all 11 network sources, the GitHub
// API (resume-vault reads/writes), and Resend are all mocked behind a single
// fetch router keyed on URL. Only two sources return a real posting — one
// immediate-alert source (TherapyNotes) and one digest source (Adzuna) — so
// the assertions stay legible instead of drowning in 11 sources' worth of
// noise. Every other source returns an empty result, exercising the "safely
// contains an empty/no-match result" path for free.

function base64(text: string) {
  return Buffer.from(text, "utf-8").toString("base64");
}

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

function textResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(text),
  };
}

const CONTEXT_MD = `## Master Skill Inventory

### Confirmed
Playwright, TypeScript, Selenium, REST API testing.

### Unconfirmed
Kubernetes exposure, but not confirmed production experience.
`;

const RESUME_CONTENT = "Extensive experience with Playwright, TypeScript, Selenium, and REST API test automation.";

function makeFetchRouter(options: { failAdzuna?: boolean } = {}) {
  return vi.fn(async (url: string, fetchOptions: any = {}) => {
    if (url.includes("apply.workable.com/api/v1/widget/accounts/therapynotes")) {
      return jsonResponse({
        jobs: [
          {
            title: "Remote Senior SDET",
            shortcode: "NEW-TN-1",
            url: "https://apply.workable.com/j/NEW-TN-1",
            published_on: new Date().toISOString().slice(0, 10),
            created_at: new Date().toISOString().slice(0, 10),
          },
        ],
      });
    }
    if (url.includes("jobs.workable.com/api/v1/jobs")) return jsonResponse({ jobs: [] });
    if (url.includes("remoteok.com/api")) return jsonResponse([{ last_updated: 1, legal: "x" }]);
    if (url.includes("api.greenhouse.io")) return jsonResponse({ jobs: [] });
    if (url.includes("api.lever.co")) return jsonResponse([]);
    if (url.includes("api.ashbyhq.com")) return jsonResponse({ jobs: [] });
    if (url.includes("api.adzuna.com")) {
      if (options.failAdzuna) throw new Error("simulated Adzuna network failure");
      return jsonResponse({
        results: [
          {
            id: "NEW-AZ-1",
            title: "Quality Engineer",
            redirect_url: "https://www.adzuna.com/land/ad/NEW-AZ-1",
            company: { display_name: "Acme Health" },
            location: { display_name: "Remote - US" },
            created: new Date().toISOString(),
            salary_min: 90000,
            salary_max: 120000,
            description: "This is a fully remote role requiring 3+ years of experience in test automation.",
          },
        ],
      });
    }
    if (url.includes("data.usajobs.gov")) return jsonResponse({ SearchResult: { SearchResultItems: [] } });
    if (url.includes("soltech.hire.trakstar.com")) return textResponse("<rss><channel></channel></rss>");
    if (url.includes("statheros.freshteam.com")) return textResponse("<html></html>");
    if (url.includes("careers.quarterhill.com")) return jsonResponse({ jobs: [] });
    if (url.includes("/contents/CONTEXT.md")) return jsonResponse({ content: base64(CONTEXT_MD) });
    if (url.includes("/contents/resumes/")) return jsonResponse({ content: base64(RESUME_CONTENT) });
    if (url.endsWith("/contents/resumes")) return jsonResponse([{ name: "resume1.md", type: "file" }]);
    if (url.includes("/contents/template-drafts/")) return jsonResponse({ content: {} });
    if (url.includes("api.resend.com")) return jsonResponse({ id: "mock-email-id" });
    throw new Error(`Unmocked URL in main() integration test: ${fetchOptions.method ?? "GET"} ${url}`);
  });
}

let tempDir: string;
let originalCwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "jobsearch-main-test-"));
  process.chdir(tempDir);
  writeFileSync("seen-jobs.json", JSON.stringify(["some-other-key-already-seen"]));
  process.env.FROM_EMAIL = "alerts@example.com";
  process.env.TO_EMAIL = "me@example.com";
  process.env.RESUME_VAULT_TOKEN = "test-token";
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("main()", () => {
  it("sends an immediate alert for the new TherapyNotes posting, queues the new Adzuna posting for the digest without sending it yet, and persists all three state files", async () => {
    const fetchMock = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await main();

    // seen-jobs.json: both new postings recorded alongside the pre-seeded key
    const seen = JSON.parse(readFileSync("seen-jobs.json", "utf-8"));
    expect(seen).toEqual(
      expect.arrayContaining(["some-other-key-already-seen", "tn:NEW-TN-1", "az:NEW-AZ-1"]),
    );
    expect(seen).toHaveLength(3);

    // application-tracker.json: only the immediate (TherapyNotes) posting is
    // recorded this run — the Adzuna posting is only recorded once its digest
    // actually sends, which shouldn't happen on this run.
    const tracker = JSON.parse(readFileSync("application-tracker.json", "utf-8"));
    expect(Object.keys(tracker)).toEqual(["tn:NEW-TN-1"]);

    // digest-state.json: the Adzuna posting is queued, and lastSentAt starts
    // the clock now rather than triggering an immediate send — this is the
    // "first digest job ever seen starts the clock without sending
    // immediately" behavior documented in TESTING.md's roadmap.
    const digestState = JSON.parse(readFileSync("digest-state.json", "utf-8"));
    expect(digestState.queue).toHaveLength(1);
    expect(digestState.queue[0].key).toBe("az:NEW-AZ-1");
    expect(digestState.lastSentAt).toBeTruthy();

    // Resend was called exactly once (the immediate alert) — no digest email
    // this run since the interval clock only just started.
    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.resend.com"));
    expect(resendCalls).toHaveLength(1);
    const alertBody = JSON.parse(resendCalls[0][1].body);
    expect(alertBody.subject).toBe("1 new job posting found");
    expect(alertBody.html).toContain("Remote Senior SDET");

    // Template drafts: committed to GitHub for both new postings (the
    // template-kit path runs for every new job, independent of the
    // AI_PIPELINE_ENABLED-gated allowlist path).
    const templateDraftCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/contents/template-drafts/"),
    );
    expect(templateDraftCalls).toHaveLength(2);
  });

  it("does not send an alert or touch state files on a first run (no seen-jobs.json yet) — it only baselines", async () => {
    rmSync("seen-jobs.json");
    const fetchMock = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await main();

    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.resend.com"));
    expect(resendCalls).toHaveLength(0);
    expect(existsSync("application-tracker.json")).toBe(false);
    expect(existsSync("digest-state.json")).toBe(false);

    const seen = JSON.parse(readFileSync("seen-jobs.json", "utf-8"));
    expect(seen).toEqual(expect.arrayContaining(["tn:NEW-TN-1", "az:NEW-AZ-1"]));
  });

  it("sends the queued digest once the interval has elapsed, on a later run", async () => {
    writeFileSync(
      "digest-state.json",
      JSON.stringify({
        lastSentAt: new Date(Date.now() - 13 * 3600000).toISOString(),
        queue: [
          {
            key: "az:OLD-QUEUED-1",
            title: "Old Queued Quality Engineer",
            url: "https://www.adzuna.com/land/ad/OLD-QUEUED-1",
            company: "Old Queued Co",
            postedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    const fetchMock = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    await main();

    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.resend.com"));
    // One immediate alert (TherapyNotes) + one digest send. The digest send
    // includes BOTH the old queued job and this run's newly-arrived Adzuna
    // job — the new job gets pushed onto the queue *before* the interval
    // check runs, so it rides along in the same batch rather than waiting
    // for the next cycle.
    expect(resendCalls).toHaveLength(2);
    const bodies = resendCalls.map(([, opts]: any) => JSON.parse(opts.body));
    const digestBody = bodies.find((b: any) => b.subject.startsWith("Daily digest"));
    expect(digestBody.html).toContain("Old Queued Quality Engineer");
    expect(digestBody.html).toContain("Acme Health");

    const digestState = JSON.parse(readFileSync("digest-state.json", "utf-8"));
    // The queue is fully cleared after sending — nothing carries over.
    expect(digestState.queue).toEqual([]);

    const tracker = JSON.parse(readFileSync("application-tracker.json", "utf-8"));
    expect(Object.keys(tracker)).toEqual(
      expect.arrayContaining(["tn:NEW-TN-1", "az:OLD-QUEUED-1", "az:NEW-AZ-1"]),
    );
  });

  it("contains a single source's rejected fetch call rather than crashing the whole run, and still alerts on the other sources' postings", async () => {
    // Every mocked source in every other test in this suite resolves
    // successfully — nothing has ever actually thrown into safely()/
    // safelyValue()/safelyRun() to prove they contain a failure rather than
    // letting it crash main() entirely. Adzuna's fetch call is made to
    // reject here while all 10 other sources continue to resolve normally.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = makeFetchRouter({ failAdzuna: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(main()).resolves.toBeUndefined();

    // The immediate alert (TherapyNotes) still goes out even though Adzuna's
    // fetch rejected.
    const resendCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("api.resend.com"));
    expect(resendCalls).toHaveLength(1);
    const alertBody = JSON.parse(resendCalls[0][1].body);
    expect(alertBody.html).toContain("Remote Senior SDET");

    // seen-jobs.json only records the TherapyNotes posting — the Adzuna
    // posting was never fetched at all, so it was never seen this run.
    const seen = JSON.parse(readFileSync("seen-jobs.json", "utf-8"));
    expect(seen).toEqual(expect.arrayContaining(["some-other-key-already-seen", "tn:NEW-TN-1"]));
    expect(seen).not.toContain("az:NEW-AZ-1");

    // safely() logged the failure under Adzuna's label rather than
    // swallowing it silently.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Adzuna failed:",
      expect.objectContaining({ message: "simulated Adzuna network failure" }),
    );

    consoleErrorSpy.mockRestore();
  });
});

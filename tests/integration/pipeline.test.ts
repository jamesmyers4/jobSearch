import { describe, it, expect } from "vitest";
import { isRemoteJob, isFreshJob, dedupeBySignature, scoreJob, type JobPosting } from "../../check-jobs.ts";

// NOTE — scope of this file: this composes the real filter/dedupe/score pipeline
// end to end, which is exactly where the two real bugs earlier in this project's
// history actually lived (isRemoteJob's one-directional signal bug, and the SQL
// gap-flag false positive) — each individual piece was correct in isolation, the
// bug only showed up once things were composed together.
//
// This is NOT the same as a true main()-level integration test, which would also
// need every network fetcher mocked (all 11 sources), plus Resend and the GitHub
// API (for template-drafts and state-file commits) mocked. That's a larger, separate
// piece of work — see TESTING.md's roadmap for what that would require.

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

describe("filter -> dedupe -> score pipeline", () => {
  it("runs a realistic mixed batch through the full pipeline in the right order", () => {
    const jobs: JobPosting[] = [
      // Real-time source, fresh, remote, strong title -> should end up first
      { key: "tn:1", title: "Senior SDET", url: "https://x/1", company: "TherapyNotes", location: "Remote", postedAt: daysAgo(0) },
      // Same job as above, duplicated via a different source -> should be deduped away
      { key: "wk:1", title: "Senior SDET", url: "https://x/1b", company: "TherapyNotes, Inc.", location: "Remote", postedAt: daysAgo(0) },
      // Not remote -> should be filtered out entirely
      { key: "az:2", title: "QA Automation Engineer", url: "https://x/2", company: "Onsite Co", location: "Nashville, TN", postedAt: daysAgo(0) },
      // Remote but stale (older than MAX_ALERT_AGE_DAYS) -> should be filtered out
      { key: "az:3", title: "QA Automation Engineer", url: "https://x/3", company: "Stale Co", location: "Remote", postedAt: daysAgo(30) },
      // Remote, fresh, low-credibility source, generic title -> should survive but score low
      { key: "az:4", title: "Quality Engineer", url: "https://x/4", company: "Low Signal Co", location: "Remote", postedAt: daysAgo(5) },
    ];

    const result = jobs.filter(isRemoteJob).filter(isFreshJob);
    const deduped = dedupeBySignature(result);
    const sorted = [...deduped].sort((a, b) => scoreJob(b) - scoreJob(a));

    expect(sorted.map((j) => j.key)).toEqual(["tn:1", "az:4"]);
    expect(scoreJob(sorted[0])).toBeGreaterThan(scoreJob(sorted[1]));
  });
});

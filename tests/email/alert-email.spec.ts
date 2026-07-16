import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { buildAlertEmailHtml, type JobPosting, type CompanyHistory } from "../../check-jobs.ts";

// This is the one place in the suite that touches a real browser — the email
// HTML is the only genuinely visual artifact this headless script produces,
// so rendering it for real (rather than string-matching) catches things a
// unit test can't: malformed markup, broken links, elements that don't
// actually render the way the template string implies they will.

test("alert email renders fire tags, salary, and a template-draft link correctly", async ({ page }) => {
  const jobs: JobPosting[] = [
    {
      key: "tn:1",
      title: "Senior SDET",
      url: "https://example.com/jobs/1",
      company: "TherapyNotes",
      location: "Remote",
      postedAt: new Date().toISOString(),
      salaryRange: "$90,000–$120,000",
      templateDraftUrl: "https://github.com/jamesmyers4/resume-vault/blob/main/template-drafts/tn-1.md",
    },
  ];

  const { subject, html } = buildAlertEmailHtml(jobs, new Map());
  expect(subject).toBe("1 new job posting found");

  await page.setContent(html);

  const listItem = page.locator("li").first();
  await expect(listItem).toContainText("🔥");
  await expect(listItem).toContainText("Senior SDET");
  await expect(listItem).toContainText("$90,000–$120,000");

  const draftLink = page.getByRole("link", { name: "template draft" });
  await expect(draftLink).toHaveAttribute(
    "href",
    "https://github.com/jamesmyers4/resume-vault/blob/main/template-drafts/tn-1.md",
  );

  const jobLink = page.getByRole("link", { name: "Senior SDET" });
  await expect(jobLink).toHaveAttribute("href", "https://example.com/jobs/1");
});

test("a job at a company flagged caution shows the status tag inline", async ({ page }) => {
  // company-history.json in the repo root currently has no "caution" or
  // "blocked" entries — both real companies in it are "active" (a rejection
  // with a reapply invitation, and an ambiguous single rejection, neither of
  // which warrants a flag yet). So this exercises the tag-rendering branch
  // against a synthetic file in an isolated temp cwd, loaded via a
  // cache-busted dynamic import (COMPANY_HISTORY is only read once, at
  // check-jobs.ts's first import, so re-importing the same specifier would
  // hit Node's module cache and still see the real repo file).
  const tempDir = mkdtempSync(join(tmpdir(), "jobsearch-alert-email-test-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(tempDir);
    const history: CompanyHistory = {
      "flaky-corp": {
        displayName: "Flaky Corp",
        aliases: [],
        applications: [],
        reapplyInvited: null,
        status: "caution",
        statusReason: "Test fixture.",
        lastUpdated: "2026-07-16",
      },
    };
    writeFileSync("company-history.json", JSON.stringify(history));
    const moduleUrl = `${pathToFileURL(resolve(originalCwd, "check-jobs.ts")).href}?t=${Date.now()}`;
    const fresh = (await import(moduleUrl)) as typeof import("../../check-jobs.ts");

    const jobs: JobPosting[] = [
      {
        key: "wk:1",
        title: "SDET",
        url: "https://example.com/jobs/2",
        company: "Flaky Corp",
        postedAt: new Date().toISOString(),
      },
    ];
    const { html } = fresh.buildAlertEmailHtml(jobs, new Map());
    await page.setContent(html);
    await expect(page.locator("li").first()).toContainText("[caution]");
  } finally {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

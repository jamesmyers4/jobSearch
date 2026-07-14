import { test, expect } from "@playwright/test";
import { buildAlertEmailHtml, type JobPosting } from "../../check-jobs.ts";

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

test("a job at a rejected company shows the status tag inline", async ({ page }) => {
  // Relies on the real company-history.json in the repo marking
  // "Golden Pet Brands" as rejected.
  const jobs: JobPosting[] = [
    {
      key: "wk:1",
      title: "SDET",
      url: "https://example.com/jobs/2",
      company: "Golden Pet Brands",
      postedAt: new Date().toISOString(),
    },
  ];
  const { html } = buildAlertEmailHtml(jobs, new Map());
  await page.setContent(html);
  await expect(page.locator("li").first()).toContainText("[rejected]");
});

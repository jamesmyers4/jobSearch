import { test, expect } from "@playwright/test";
import { buildDigestEmailHtml, type JobPosting } from "../../check-jobs.ts";

// Mirrors alert-email.spec.ts's approach: render the real HTML string via
// page.setContent() and assert on real DOM rather than string-matching.

test("digest email sorts jobs by score, labels the source, and links a template draft", async ({ page }) => {
  const jobs: JobPosting[] = [
    {
      key: "az:1",
      title: "Quality Engineer",
      url: "https://example.com/jobs/low",
      company: "Low Signal Co",
      location: "Remote",
      postedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      key: "rok:1",
      title: "Senior SDET",
      url: "https://example.com/jobs/high",
      company: "High Signal Co",
      location: "Remote",
      postedAt: new Date().toISOString(),
      templateDraftUrl: "https://github.com/jamesmyers4/resume-vault/blob/main/template-drafts/high-signal-co.md",
    },
  ];

  const { subject, html } = buildDigestEmailHtml(jobs);
  expect(subject).toBe("Daily digest: 2 RemoteOK/Adzuna job postings");

  await page.setContent(html);

  const items = page.locator("li");
  await expect(items).toHaveCount(2);

  // rok:1 scores higher than az:1 (fresher, RemoteOK source weight, strong title) -> sorted first
  await expect(items.first()).toContainText("[RemoteOK]");
  await expect(items.first()).toContainText("Senior SDET");

  const draftLink = page.getByRole("link", { name: "template draft" });
  await expect(draftLink).toHaveAttribute(
    "href",
    "https://github.com/jamesmyers4/resume-vault/blob/main/template-drafts/high-signal-co.md",
  );

  await expect(items.last()).toContainText("[Adzuna]");
  await expect(items.last()).toContainText("Quality Engineer");
});

test("a job at a rejected company shows the status tag inline", async ({ page }) => {
  // Relies on the real company-history.json in the repo marking
  // "Golden Pet Brands" as rejected.
  const jobs: JobPosting[] = [
    {
      key: "az:2",
      title: "QA Engineer",
      url: "https://example.com/jobs/2",
      company: "Golden Pet Brands",
      postedAt: new Date().toISOString(),
    },
  ];
  const { html } = buildDigestEmailHtml(jobs);
  await page.setContent(html);
  await expect(page.locator("li").first()).toContainText("[rejected]");
});

test("subject uses singular 'job posting' for a single-job digest", async ({ page }) => {
  const jobs: JobPosting[] = [
    {
      key: "az:3",
      title: "QA Engineer",
      url: "https://example.com/jobs/3",
      company: "Solo Co",
      postedAt: new Date().toISOString(),
    },
  ];
  const { subject } = buildDigestEmailHtml(jobs);
  expect(subject).toBe("Daily digest: 1 RemoteOK/Adzuna job posting");
});

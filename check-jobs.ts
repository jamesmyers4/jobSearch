import "dotenv/config";
import { Resend } from "resend";
import { readFileSync, writeFileSync } from "fs";

const THERAPYNOTES_URL =
  "https://apply.workable.com/api/v1/widget/accounts/therapynotes";
const SEARCH_URL = "https://jobs.workable.com/api/v1/jobs";
const REMOTEOK_URL = "https://remoteok.com/api";
const GREENHOUSE_COMPANIES: string[] = [];
const LEVER_COMPANIES: string[] = [];
const ASHBY_COMPANIES: string[] = [];

const SEARCH_TITLES = [
  "SDET",
  "Senior SDET",
  "Lead SDET",
  "Staff SDET",
  "QA Automation Engineer",
  "Senior QA Automation Engineer",
  "Lead QA Automation Engineer",
  "Test Automation Engineer",
  "Software Development Engineer in Test",
  "Senior Software Development Engineer in Test",
  "Lead Software Development Engineer in Test",
  "Staff Software Development Engineer in Test",
  "Quality Engineer",
  "QA Engineer",
  "Senior QA Engineer",
  "Lead QA Engineer",
  "Software Test Engineer",
  "Senior Software Test Engineer",
  "Test Engineer",
  "Senior Test Engineer",
  "Automation Engineer",
  "Senior Automation Engineer",
  "Lead Automation Engineer",
  "QA Automation Lead",
  "Automation Test Engineer",
  "Test Automation Architect",
  "Automation Architect",
];

const REMOTE_ONLY = true;
const REMOTE_KEYWORDS = [
  "remote",
  "work from home",
  "wfh",
  "anywhere",
  "distributed",
];

const EXCLUDE_KEYWORDS = [
  "manufacturing",
  "factory",
  "industrial",
  "plant",
  "robotics",
  "rpa",
  "uipath",
  "ansible",
  "controls engineer",
];

const ADZUNA_SEARCH_TITLES = [
  "SDET",
  "QA Automation Engineer",
  "Test Automation Engineer",
  "Software Development Engineer in Test",
  "QA Engineer",
  "Automation Engineer",
];

const USAJOBS_KEYWORDS = [
  "software tester",
  "quality assurance",
  "test automation",
];

const SEEN_JOBS_PATH = "seen-jobs.json";
const MAX_DRAFT_AGE_DAYS = 4;
const DRAFT_MAX_TOKENS = 8000;
const RESUME_VAULT_REPO = "jamesmyers4/resume-vault";
const resend = new Resend(process.env.RESEND_API_KEY);
const PREFILTER_MODEL = "claude-haiku-4-5-20251001";
const DRAFT_MODEL = "claude-sonnet-5";
const AI_PIPELINE_ENABLED = process.env.AI_PIPELINE_ENABLED === "true";
const AI_DRAFT_COMPANY_ALLOWLIST = ["TherapyNotes"];
const MAX_DRAFTS_PER_RUN = 3;

function isRemoteJob(job: JobPosting): boolean {
  if (!REMOTE_ONLY) return true;
  if (job.key.startsWith("rok:")) return true;
  const text = `${job.location ?? ""} ${job.title}`.toLowerCase();
  if (text.includes("hybrid")) return false;
  return REMOTE_KEYWORDS.some((term) => text.includes(term));
}

interface JobPosting {
  key: string;
  title: string;
  url: string;
  company?: string;
  location?: string;
  postedAt?: string | number;
  description?: string;
}

function matchesAnyTitle(title: string): boolean {
  const lower = title.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((term) => lower.includes(term))) return false;
  return SEARCH_TITLES.some((term) => lower.includes(term.toLowerCase()));
}

function isAllowlistedCompany(job: JobPosting): boolean {
  if (!job.company) return false;
  const company = job.company.toLowerCase();
  return AI_DRAFT_COMPANY_ALLOWLIST.some((name) =>
    company.includes(name.toLowerCase()),
  );
}

function daysAgoLabel(postedAt?: string | number): string {
  if (postedAt === undefined) return "posted date unknown";
  const posted = new Date(postedAt);
  if (isNaN(posted.getTime())) return "posted date unknown";
  const days = Math.floor(
    (Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "posted today";
  if (days === 1) return "posted 1 day ago";
  return `posted ${days} days ago`;
}

function draftHeader(job: JobPosting): string {
  const lines = [
    `# ${job.title} — ${job.company ?? "unknown company"}`,
    `Posting: ${job.url}`,
    `Location: ${job.location ?? "unknown"}`,
    `Discovered: ${daysAgoLabel(job.postedAt)}`,
    "",
    "## Original Job Description",
    job.description ?? "Not provided by source.",
    "",
    "---",
    "",
  ];
  return lines.join("\n");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function daysOld(postedAt?: string | number): number {
  if (postedAt === undefined) return Infinity;
  const posted = new Date(postedAt);
  if (isNaN(posted.getTime())) return Infinity;
  return Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
}

async function fetchTherapyNotesJobs(): Promise<JobPosting[]> {
  const response = await fetch(THERAPYNOTES_URL);
  const data = await response.json();
  const jobs = data.jobs ?? [];
  return jobs.map((job: any) => ({
    key: `tn:${job.shortcode}`,
    title: job.title,
    url: job.url,
    company: "TherapyNotes",
    location: job.location?.location_str,
    postedAt: job.published_on ?? job.created_at,
  }));
}

async function fetchTitleSearchJobs(title: string): Promise<JobPosting[]> {
  const response = await fetch(
    `${SEARCH_URL}?query=${encodeURIComponent(title)}`,
  );
  const data = await response.json();
  const jobs = data.jobs ?? data.results ?? [];
  return jobs
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => ({
      key: `wk:${job.uuid ?? job.id}`,
      title: job.title,
      url: job.url ?? job.shortlink,
      company: job.company?.name ?? job.companyName,
      location: job.location?.location_str ?? job.location,
      postedAt: job.updatedAt,
    }));
}

async function fetchAllTitleSearchJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(SEARCH_TITLES.map(fetchTitleSearchJobs));
  const merged = results.flat();
  const deduped = new Map(merged.map((job) => [job.key, job]));
  return [...deduped.values()];
}

async function fetchGreenhouseJobs(company: string): Promise<JobPosting[]> {
  const response = await fetch(
    `https://api.greenhouse.io/v1/boards/${company}/jobs?content=true`,
  );
  const data = await response.json();
  const jobs = data.jobs ?? [];
  return jobs
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => ({
      key: `gh:${company}:${job.id}`,
      title: job.title,
      url: job.absolute_url,
      company,
      location: job.location?.name,
      postedAt: job.updated_at,
    }));
}

async function fetchAllGreenhouseJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(
    GREENHOUSE_COMPANIES.map(fetchGreenhouseJobs),
  );
  return results.flat();
}

async function fetchLeverJobs(company: string): Promise<JobPosting[]> {
  const response = await fetch(
    `https://api.lever.co/v0/postings/${company}?mode=json`,
  );
  const data = await response.json();
  const jobs = Array.isArray(data) ? data : [];
  return jobs
    .filter((job: any) => matchesAnyTitle(job.text))
    .map((job: any) => ({
      key: `lv:${company}:${job.id}`,
      title: job.text,
      url: job.hostedUrl,
      company,
      location: job.categories?.location,
      postedAt: job.createdAt,
    }));
}

async function fetchAllLeverJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(LEVER_COMPANIES.map(fetchLeverJobs));
  return results.flat();
}

async function fetchAshbyJobs(company: string): Promise<JobPosting[]> {
  const response = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${company}?includeCompensation=true`,
  );
  const data = await response.json();
  const jobs = data.jobs ?? [];
  return jobs
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => ({
      key: `ab:${company}:${job.id}`,
      title: job.title,
      url: job.jobUrl ?? job.applyUrl,
      company,
      location: job.location ?? job.locationName,
      postedAt: job.publishedAt,
    }));
}

async function fetchAllAshbyJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(ASHBY_COMPANIES.map(fetchAshbyJobs));
  return results.flat();
}

async function fetchRemoteOKJobs(): Promise<JobPosting[]> {
  const response = await fetch(REMOTEOK_URL);
  const data = await response.json();
  const jobs = data.filter((item: any) => item.id && item.position);
  return jobs
    .filter((job: any) => matchesAnyTitle(job.position))
    .map((job: any) => ({
      key: `rok:${job.id}`,
      title: job.position,
      url: job.url,
      company: job.company,
      location: job.location,
      postedAt: job.date ?? job.epoch,
    }));
}

async function fetchAdzunaJobs(title: string): Promise<JobPosting[]> {
  const response = await fetch(
    `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&results_per_page=20&max_days_old=${MAX_DRAFT_AGE_DAYS}&what=${encodeURIComponent(title)}&content-type=application/json`,
    {
      headers: {
        "User-Agent":
          "jobSearch-checker/1.0 (github.com/jamesmyers4/jobSearch)",
        Accept: "application/json",
      },
    },
  );
  const data = await response.json();
  const jobs = data.results ?? [];
  return jobs.map
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => ({
      key: `az:${job.id}`,
      title: job.title,
      url: job.redirect_url,
      company: job.company?.display_name,
      location: job.location?.display_name,
      postedAt: job.created,
      description: job.description,
    }));
}

async function fetchAllAdzunaJobs(): Promise<JobPosting[]> {
  const merged: JobPosting[] = [];
  for (const title of ADZUNA_SEARCH_TITLES) {
    const jobs = await fetchAdzunaJobs(title);
    merged.push(...jobs);
  }
  const deduped = new Map(merged.map((job) => [job.key, job]));
  return [...deduped.values()];
}

async function fetchUSAJobs(keyword: string): Promise<JobPosting[]> {
  const response = await fetch(
    `https://data.usajobs.gov/api/Search?Keyword=${encodeURIComponent(keyword)}&ResultsPerPage=50`,
    {
      headers: {
        Host: "data.usajobs.gov",
        "User-Agent": process.env.USAJOBS_EMAIL as string,
        "Authorization-Key": process.env.USAJOBS_AUTH_KEY as string,
      },
    },
  );
  const data = await response.json();
  const items = data.SearchResult?.SearchResultItems ?? [];
  return items
    .map((item: any) => item.MatchedObjectDescriptor)
    .filter((job: any) => matchesAnyTitle(job.PositionTitle))
    .map((job: any) => ({
      key: `usaj:${job.PositionID}`,
      title: job.PositionTitle,
      url: job.PositionURI,
      company: job.OrganizationName,
      location: job.PositionLocationDisplay,
      postedAt: job.PublicationStartDate,
    }));
}

async function fetchAllUSAJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(USAJOBS_KEYWORDS.map(fetchUSAJobs));
  const merged = results.flat();
  const deduped = new Map(merged.map((job) => [job.key, job]));
  return [...deduped.values()];
}

async function githubApi(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const response = await fetch(
    `https://api.github.com/repos/${RESUME_VAULT_REPO}/contents/${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.RESUME_VAULT_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        ...options.headers,
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub API ${response.status} on ${path}`);
  return response.json();
}

async function fetchResumeCorpus(): Promise<string> {
  const files = await githubApi("resumes");
  const readable = files.filter((f: any) => f.type === "file");
  const contents = await Promise.all(
    readable.map(async (file: any) => {
      const data = await githubApi(`resumes/${file.name}`);
      return Buffer.from(data.content, "base64").toString("utf-8");
    }),
  );
  return contents.join("\n\n---\n\n");
}

async function fetchContext(): Promise<string> {
  const data = await githubApi("CONTEXT.md");
  return Buffer.from(data.content, "base64").toString("utf-8");
}

async function commitDraft(slug: string, content: string): Promise<void> {
  await githubApi(`drafts/${slug}.md`, {
    method: "PUT",
    body: JSON.stringify({
      message: `add draft resume for ${slug}`,
      content: Buffer.from(content, "utf-8").toString("base64"),
    }),
  });
}

function slugify(job: JobPosting): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${job.company ?? "unknown"}-${job.title}-${date}`;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function callClaude(
  system: string,
  prompt: string,
  model: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.usage)
    console.log(
      `${model} usage: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`,
    );
  const textBlock = data.content?.find((block: any) => block.type === "text");
  return textBlock?.text ?? "";
}

async function prefilterJob(job: JobPosting): Promise<boolean> {
  const descriptionLine = job.description
    ? `\nDescription: ${job.description.slice(0, 1000)}`
    : "";
  const prompt = `Title: ${job.title}\nCompany: ${job.company ?? "unknown"}\nLocation: ${job.location ?? "unknown"}${descriptionLine}\n\nIs this a genuine match for a QA Automation Engineer / SDET with 22 years of enterprise software experience and 5 years of test automation (Playwright/TypeScript, Selenium, REST API testing)? Reply with only "yes" or "no".`;
  const result = await callClaude(
    "You are screening job postings for relevance. Reply with only yes or no.",
    prompt,
    PREFILTER_MODEL,
    10,
  );
  return result.trim().toLowerCase().startsWith("y");
}

async function draftResume(
  job: JobPosting,
  corpus: string,
  context: string,
): Promise<string> {
  const descriptionLine = job.description
    ? `\nDescription: ${job.description}`
    : "";
  const prompt = `Job posting:\nTitle: ${job.title}\nCompany: ${job.company ?? "unknown"}\nLocation: ${job.location ?? "unknown"}${descriptionLine}\n\nContext and framing rules:\n${context}\n\nPast resume corpus:\n${corpus}\n\nDraft a tailored two-page resume for this posting, following the framing rules exactly. If anything about the fit is genuinely ambiguous, flag it clearly at the top under a "NEEDS REVIEW" heading instead of guessing.`;
  return callClaude(
    "You are drafting a tailored resume from an existing corpus and framing rules.",
    prompt,
    DRAFT_MODEL,
    DRAFT_MAX_TOKENS,
  );
}

function loadSeenJobs(): { seen: Set<string>; isFirstRun: boolean } {
  try {
    const raw = readFileSync(SEEN_JOBS_PATH, "utf-8");
    return { seen: new Set(JSON.parse(raw)), isFirstRun: false };
  } catch {
    return { seen: new Set(), isFirstRun: true };
  }
}

function saveSeenJobs(seen: Set<string>) {
  writeFileSync(SEEN_JOBS_PATH, JSON.stringify([...seen], null, 2));
}

function sourceLabel(key: string): string {
  const prefix = key.split(":")[0];
  const labels: Record<string, string> = {
    tn: "TherapyNotes",
    wk: "Workable",
    gh: "Greenhouse",
    lv: "Lever",
    ab: "Ashby",
    rok: "RemoteOK",
    az: "Adzuna",
    usaj: "USAJOBS",
  };
  return labels[prefix] ?? prefix;
}

async function sendAlertEmail(
  newJobs: JobPosting[],
  drafts: Map<string, string>,
) {
  const listHtml = newJobs
    .map(
      (job) =>
        `<li><a href="${job.url}">${job.title}</a> — ${job.company ?? "unknown company"} — ${job.location ?? "location unknown"} — ${daysAgoLabel(job.postedAt)}${drafts.has(job.key) ? " — draft resume attached" : ""}</li>`,
    )
    .join("");
  const jobWord = newJobs.length === 1 ? "job posting" : "job postings";
  const draftWord = drafts.size === 1 ? "draft" : "drafts";
  const bySource = new Map<string, number>();
  for (const job of newJobs) {
    const label = sourceLabel(job.key);
    bySource.set(label, (bySource.get(label) ?? 0) + 1);
  }
  const breakdown = [...bySource.entries()]
    .map(([label, count]) => `${count} ${label}`)
    .join(", ");
  const summary = `<p>${newJobs.length} new remote ${jobWord} (${breakdown})${drafts.size > 0 ? ` — ${drafts.size} ${draftWord} attached` : ""}.</p>`;
  const attachments = newJobs
    .filter((job) => drafts.has(job.key))
    .map((job) => ({
      filename: `${slugify(job)}.md`,
      content: Buffer.from(drafts.get(job.key) as string, "utf-8"),
    }));
  await resend.emails.send({
    from: process.env.FROM_EMAIL as string,
    to: process.env.TO_EMAIL as string,
    subject: `${newJobs.length} new ${jobWord} found`,
    html: `${summary}<ul>${listHtml}</ul>`,
    attachments,
  });
}

async function safely<T>(promise: Promise<T[]>, label: string): Promise<T[]> {
  try {
    return await promise;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return [];
  }
}

async function safelyValue<T>(
  promise: Promise<T>,
  label: string,
  fallback: T,
): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return fallback;
  }
}

async function safelyRun(promise: Promise<void>, label: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    console.error(`${label} failed:`, err);
  }
}

async function main() {
  const [
    therapyNotesJobs,
    titleSearchJobs,
    greenhouseJobs,
    leverJobs,
    ashbyJobs,
    remoteOkJobs,
    adzunaJobs,
    usaJobs,
  ] = await Promise.all([
    safely(fetchTherapyNotesJobs(), "TherapyNotes"),
    safely(fetchAllTitleSearchJobs(), "Workable title search"),
    safely(fetchAllGreenhouseJobs(), "Greenhouse"),
    safely(fetchAllLeverJobs(), "Lever"),
    safely(fetchAllAshbyJobs(), "Ashby"),
    safely(fetchRemoteOKJobs(), "RemoteOK"),
    safely(fetchAllAdzunaJobs(), "Adzuna"),
    safely(fetchAllUSAJobs(), "USAJOBS"),
  ]);

  const allJobs = [
    ...therapyNotesJobs,
    ...titleSearchJobs,
    ...greenhouseJobs,
    ...leverJobs,
    ...ashbyJobs,
    ...remoteOkJobs,
    ...adzunaJobs,
    ...usaJobs,
  ].filter(isRemoteJob);

  const { seen, isFirstRun } = loadSeenJobs();
  const newJobs = allJobs.filter((job) => !seen.has(job.key));

  if (newJobs.length > 0 && !isFirstRun) {
    const drafts = new Map<string, string>();
    if (AI_PIPELINE_ENABLED) {
      const context = await safelyValue(fetchContext(), "fetchContext", "");
      const corpus = await safelyValue(
        fetchResumeCorpus(),
        "fetchResumeCorpus",
        "",
      );
      if (context && corpus) {
        for (const job of newJobs) {
          if (drafts.size >= MAX_DRAFTS_PER_RUN) break;
          if (daysOld(job.postedAt) > MAX_DRAFT_AGE_DAYS) continue;
          if (!isAllowlistedCompany(job)) continue;
          const isMatch = await safelyValue(
            prefilterJob(job),
            `prefilter ${job.key}`,
            false,
          );
          if (isMatch) {
            const draft = await safelyValue(
              draftResume(job, corpus, context),
              `draft ${job.key}`,
              "",
            );
            if (draft) {
              const fullDraft = draftHeader(job) + draft;
              await safelyRun(
                commitDraft(slugify(job), fullDraft),
                `commitDraft ${job.key}`,
              );
              drafts.set(job.key, fullDraft);
            }
          }
        }
      }
    }
    await sendAlertEmail(newJobs, drafts);
    console.log(`Sent alert for ${newJobs.length} new job(s)`);
  } else {
    console.log(
      isFirstRun ? "First run, baselining current jobs" : "No new jobs",
    );
  }
  if (newJobs.length > 0 || isFirstRun) {
    for (const job of newJobs) seen.add(job.key);
    saveSeenJobs(seen);
  }
}
main();

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
const resend = new Resend(process.env.RESEND_API_KEY);

interface JobPosting {
  key: string;
  title: string;
  url: string;
  company?: string;
  location?: string;
  postedAt?: string | number;
}

function matchesAnyTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return SEARCH_TITLES.some((term) => lower.includes(term.toLowerCase()));
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
  return jobs.map((job: any) => ({
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
    `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${process.env.ADZUNA_APP_ID}&app_key=${process.env.ADZUNA_APP_KEY}&results_per_page=20&what=${encodeURIComponent(title)}&content-type=application/json`,
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
  return jobs.map((job: any) => ({
    key: `az:${job.id}`,
    title: job.title,
    url: job.redirect_url,
    company: job.company?.display_name,
    location: job.location?.display_name,
    postedAt: job.created,
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

async function sendAlertEmail(newJobs: JobPosting[]) {
  const listHtml = newJobs
    .map(
      (job) =>
        `<li><a href="${job.url}">${job.title}</a> — ${job.company ?? "unknown company"} — ${job.location ?? "location unknown"} — ${daysAgoLabel(job.postedAt)}</li>`,
    )
    .join("");
  const jobWord = newJobs.length === 1 ? "job posting" : "job postings";
  await resend.emails.send({
    from: process.env.FROM_EMAIL as string,
    to: process.env.TO_EMAIL as string,
    subject: `${newJobs.length} new ${jobWord} found`,
    html: `<ul>${listHtml}</ul>`,
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
  ];

  const { seen, isFirstRun } = loadSeenJobs();
  const newJobs = allJobs.filter((job) => !seen.has(job.key));

  if (newJobs.length > 0 && !isFirstRun) {
    await sendAlertEmail(newJobs);
    console.log(`Sent alert for ${newJobs.length} new job(s)`);
  } else {
    console.log(
      isFirstRun ? "First run, baselining current jobs" : "No new jobs",
    );
  }

  allJobs.forEach((job) => seen.add(job.key));
  saveSeenJobs(seen);
}

main();

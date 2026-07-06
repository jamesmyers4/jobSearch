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
const SEEN_JOBS_PATH = "seen-jobs.json";
const resend = new Resend(process.env.RESEND_API_KEY);

interface JobPosting {
  key: string;
  title: string;
  url: string;
  company?: string;
  location?: string;
}

function matchesAnyTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return SEARCH_TITLES.some((term) => lower.includes(term.toLowerCase()));
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
    }));
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
        `<li><a href="${job.url}">${job.title}</a> — ${job.company ?? "unknown company"} — ${job.location ?? "location unknown"}</li>`,
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

async function main() {
  const [
    therapyNotesJobs,
    titleSearchJobs,
    greenhouseJobs,
    leverJobs,
    ashbyJobs,
    remoteOkJobs,
  ] = await Promise.all([
    fetchTherapyNotesJobs(),
    fetchAllTitleSearchJobs(),
    fetchAllGreenhouseJobs(),
    fetchAllLeverJobs(),
    fetchAllAshbyJobs(),
    fetchRemoteOKJobs(),
  ]);
  const allJobs = [
    ...therapyNotesJobs,
    ...titleSearchJobs,
    ...greenhouseJobs,
    ...leverJobs,
    ...ashbyJobs,
    ...remoteOkJobs,
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

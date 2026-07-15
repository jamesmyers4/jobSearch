import "dotenv/config";
import { Resend } from "resend";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

export interface JobPosting {
  key: string;
  title: string;
  url: string;
  company?: string;
  location?: string;
  postedAt?: string | number;
  description?: string;
  salaryRange?: string;
  yearsRequired?: string;
  workArrangement?: string;
  templateDraftUrl?: string;
}

export interface TrackerEntry {
  title: string;
  company?: string;
  postedAt?: string | number;
  alertedAt: string;
  submittedAt?: string;
}

export interface DigestState {
  lastSentAt?: string;
  queue: JobPosting[];
}

const THERAPYNOTES_URL =
  "https://apply.workable.com/api/v1/widget/accounts/therapynotes";
const SEARCH_URL = "https://jobs.workable.com/api/v1/jobs";
const REMOTEOK_URL = "https://remoteok.com/api";
const GREENHOUSE_COMPANIES: string[] = ["impiricus"];
const LEVER_COMPANIES: string[] = [];
const ASHBY_COMPANIES: string[] = ["QAWolf"];

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
  "automated testing",
  "systems test",
  "test engineer",
  "software quality",
];

const SEEN_JOBS_PATH = "seen-jobs.json";
export const MAX_DRAFT_AGE_DAYS = 4;
export const MAX_ALERT_AGE_DAYS = 7;

const SOURCE_WEIGHT: Record<string, number> = {
  tn: 30,
  usaj: 25,
  wk: 20,
  gh: 20,
  lv: 20,
  ab: 20,
  soltech: 20,
  statheros: 20,
  qh: 20,
  rok: 10,
  az: 5,
};

const STRONG_TITLE_KEYWORDS = [
  "sdet",
  "test automation",
  "automation engineer",
  "software development engineer in test",
];

const BOOST_KEYWORDS = [
  "playwright",
  "typescript",
  "selenium",
  "ci/cd",
  "github actions",
  "agentic",
];

export const FIRE_SCORE_THRESHOLD = 45;
const DIGEST_SOURCES = new Set(["rok", "az"]);
const DIGEST_INTERVAL_HOURS = 12;
const DIGEST_STATE_PATH = "digest-state.json";
const DRAFT_MAX_TOKENS = 8000;
const RESUME_VAULT_REPO = "jamesmyers4/resume-vault";
const resend = new Resend(process.env.RESEND_API_KEY);
const PREFILTER_MODEL = "claude-haiku-4-5-20251001";
const DRAFT_MODEL = "claude-sonnet-5";
const AI_PIPELINE_ENABLED = process.env.AI_PIPELINE_ENABLED === "true";
const AI_DRAFT_COMPANY_ALLOWLIST = ["TherapyNotes"];
const MAX_DRAFTS_PER_RUN = 3;
const COMPANY_HISTORY_PATH = "company-history.json";

export function loadCompanyHistory(): Map<string, string> {
  try {
    const raw = readFileSync(COMPANY_HISTORY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    return new Map(
      Object.entries(parsed).map(([name, status]) => [
        name.toLowerCase(),
        status,
      ]),
    );
  } catch {
    return new Map();
  }
}

const COMPANY_HISTORY = loadCompanyHistory();

export function historyStatus(company?: string): string | undefined {
  if (!company) return undefined;
  const lower = company.toLowerCase();
  for (const [name, status] of COMPANY_HISTORY) {
    if (lower.includes(name)) return status;
  }
  return undefined;
}

export function isRemoteJob(job: JobPosting): boolean {
  if (!REMOTE_ONLY) return true;
  if (job.key.startsWith("rok:")) return true;
  if (job.workArrangement === "hybrid" || job.workArrangement === "onsite")
    return false;
  if (job.workArrangement === "remote") return true;
  const text = `${job.location ?? ""} ${job.title}`.toLowerCase();
  if (text.includes("hybrid")) return false;
  return REMOTE_KEYWORDS.some((term) => text.includes(term));
}

export function isFreshJob(job: JobPosting): boolean {
  if (job.postedAt === undefined) return true;
  return daysOld(job.postedAt) <= MAX_ALERT_AGE_DAYS;
}

export function normalizeForDedupe(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeBySignature(jobs: JobPosting[]): JobPosting[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const signature = job.company
      ? `${normalizeForDedupe(job.company)}::${normalizeForDedupe(job.title)}`
      : job.key;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function scoreJob(job: JobPosting): number {
  const prefix = job.key.split(":")[0];
  let score = SOURCE_WEIGHT[prefix] ?? 0;
  const titleLower = job.title.toLowerCase();
  if (STRONG_TITLE_KEYWORDS.some((term) => titleLower.includes(term)))
    score += 15;
  const age = daysOld(job.postedAt);
  if (age <= 1) score += 15;
  else if (age <= 3) score += 10;
  else if (age <= 7) score += 5;
  const text = `${job.title} ${job.description ?? ""}`.toLowerCase();
  for (const keyword of BOOST_KEYWORDS) {
    if (text.includes(keyword)) score += 3;
  }
  if (historyStatus(job.company) === "rejected") score -= 20;
  return score;
}

export function matchesAnyTitle(title: string): boolean {
  const lower = title.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((term) => lower.includes(term))) return false;
  return SEARCH_TITLES.some((term) => lower.includes(term.toLowerCase()));
}

export function formatSalaryRange(
  min?: number,
  max?: number,
  interval?: string,
): string | undefined {
  if (!min && !max) return undefined;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const suffix = interval ? ` ${interval.replace(/^Per /i, "/")}` : "";
  if (min && max) return `${fmt(min)}–${fmt(max)}${suffix}`;
  if (min) return `${fmt(min)}+${suffix}`;
  return `up to ${fmt(max as number)}${suffix}`;
}

export function extractYearsRequired(description?: string): string | undefined {
  if (!description) return undefined;
  const match = description.match(
    /\b(\d{1,2})\+?\s*(?:-|to|–)?\s*(\d{1,2})?\+?\s*years?\b[^.]{0,40}?experience/i,
  );
  return match ? match[0].replace(/\s+/g, " ").trim() : undefined;
}

export function extractWorkArrangement(
  description?: string,
): string | undefined {
  if (!description) return undefined;
  const text = description.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\b(on-site|onsite|in[\s-]office)\b/.test(text)) return "onsite";
  if (/\b(fully remote|100% remote|remote)\b/.test(text)) return "remote";
  return undefined;
}

export function isAllowlistedCompany(job: JobPosting): boolean {
  if (!job.company) return false;
  if (historyStatus(job.company) === "rejected") return false;
  const company = job.company.toLowerCase();
  return AI_DRAFT_COMPANY_ALLOWLIST.some((name) =>
    company.includes(name.toLowerCase()),
  );
}

export function daysAgoLabel(postedAt?: string | number): string {
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

export function draftHeader(job: JobPosting): string {
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

export function daysOld(postedAt?: string | number): number {
  if (postedAt === undefined) return Infinity;
  const posted = new Date(postedAt);
  if (isNaN(posted.getTime())) return Infinity;
  return Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
}

export async function fetchTherapyNotesJobs(): Promise<JobPosting[]> {
  const response = await fetch(THERAPYNOTES_URL);
  const data = await response.json();
  const jobs = data.jobs ?? [];
  return jobs
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => ({
      key: `tn:${job.shortcode}`,
      title: job.title,
      url: job.url,
      company: "TherapyNotes",
      location: [job.city, job.state].filter(Boolean).join(", ") || job.country || undefined,
      postedAt: job.published_on ?? job.created_at,
    }));
}

export async function fetchTitleSearchJobs(
  title: string,
): Promise<JobPosting[]> {
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
      company: job.company?.title ?? job.companyName,
      location: job.location
        ? [job.location.city, job.location.subregion, job.location.countryName]
            .filter(Boolean)
            .join(", ") || undefined
        : undefined,
      postedAt: job.updated ?? job.updatedAt,
    }));
}

export async function fetchAllTitleSearchJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(SEARCH_TITLES.map(fetchTitleSearchJobs));
  const merged = results.flat();
  const deduped = new Map(merged.map((job) => [job.key, job]));
  return [...deduped.values()];
}

// Greenhouse's public API returns job.content as HTML markup that is itself
// HTML-entity-encoded (e.g. a literal "<p>" tag arrives as the text
// "&lt;p&gt;"), confirmed against a real live capture — so the entities have
// to be decoded before tag-stripping can find any tags to strip.
function stripGreenhouseContent(html: string): string {
  const decoded = html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchGreenhouseJobs(
  company: string,
): Promise<JobPosting[]> {
  const response = await fetch(
    `https://api.greenhouse.io/v1/boards/${company}/jobs?content=true`,
  );
  const data = await response.json();
  const jobs = data.jobs ?? [];
  return jobs
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => {
      const description = job.content
        ? stripGreenhouseContent(job.content)
        : undefined;
      return {
        key: `gh:${company}:${job.id}`,
        title: job.title,
        url: job.absolute_url,
        company,
        location: job.location?.name,
        postedAt: job.updated_at,
        description,
        yearsRequired: extractYearsRequired(description),
        workArrangement: extractWorkArrangement(description),
      };
    });
}

export async function fetchAllGreenhouseJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(
    GREENHOUSE_COMPANIES.map(fetchGreenhouseJobs),
  );
  return results.flat();
}

export async function fetchLeverJobs(company: string): Promise<JobPosting[]> {
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

export async function fetchAllLeverJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(LEVER_COMPANIES.map(fetchLeverJobs));
  return results.flat();
}

export async function fetchAshbyJobs(company: string): Promise<JobPosting[]> {
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
      workArrangement: job.workplaceType
        ? job.workplaceType.toLowerCase().includes("remote")
          ? "remote"
          : job.workplaceType.toLowerCase().includes("hybrid")
            ? "hybrid"
            : "onsite"
        : job.isRemote === true
          ? "remote"
          : job.isRemote === false
            ? "onsite"
            : undefined,
    }));
}

export async function fetchAllAshbyJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(ASHBY_COMPANIES.map(fetchAshbyJobs));
  return results.flat();
}

export async function fetchRemoteOKJobs(): Promise<JobPosting[]> {
  const response = await fetch(REMOTEOK_URL);
  const data = await response.json();
  const rawJobs = Array.isArray(data) ? data : [];
  const jobs = rawJobs.filter((item: any) => item.id && item.position);
  return jobs
    .filter((job: any) => matchesAnyTitle(job.position))
    .map((job: any) => ({
      key: `rok:${job.id}`,
      title: job.position,
      url: job.url,
      company: job.company,
      location: job.location,
      postedAt: job.date ?? (typeof job.epoch === "number" ? job.epoch * 1000 : undefined),
    }));
}

export async function fetchAdzunaJobs(title: string): Promise<JobPosting[]> {
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
  return jobs
    .filter((job: any) => matchesAnyTitle(job.title))
    .map((job: any) => ({
      key: `az:${job.id}`,
      title: job.title,
      url: job.redirect_url,
      company: job.company?.display_name,
      location: job.location?.display_name,
      postedAt: job.created,
      description: job.description,
      salaryRange: formatSalaryRange(
        job.salary_min,
        job.salary_max,
        "Per Year",
      ),
      yearsRequired: extractYearsRequired(job.description),
      workArrangement: extractWorkArrangement(job.description),
    }));
}

export async function fetchAllAdzunaJobs(): Promise<JobPosting[]> {
  const merged: JobPosting[] = [];
  for (const title of ADZUNA_SEARCH_TITLES) {
    const jobs = await fetchAdzunaJobs(title);
    merged.push(...jobs);
  }
  const deduped = new Map(merged.map((job) => [job.key, job]));
  return [...deduped.values()];
}

export async function fetchUSAJobs(keyword: string): Promise<JobPosting[]> {
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
    .map((job: any) => {
      const remuneration = job.PositionRemuneration?.[0];
      const description = job.UserArea?.Details?.JobSummary;
      return {
        key: `usaj:${job.PositionID}`,
        title: job.PositionTitle,
        url: job.PositionURI,
        company: job.OrganizationName,
        location: job.PositionLocationDisplay,
        postedAt: job.PublicationStartDate,
        description,
        salaryRange: formatSalaryRange(
          remuneration ? parseFloat(remuneration.MinimumRange) : undefined,
          remuneration ? parseFloat(remuneration.MaximumRange) : undefined,
          remuneration?.Description,
        ),
        yearsRequired: extractYearsRequired(description),
        workArrangement: extractWorkArrangement(description),
      };
    });
}

export async function fetchAllUSAJobs(): Promise<JobPosting[]> {
  const results = await Promise.all(USAJOBS_KEYWORDS.map(fetchUSAJobs));
  const merged = results.flat();
  const deduped = new Map(merged.map((job) => [job.key, job]));
  return [...deduped.values()];
}

const SOLTECH_RSS_URL = "https://soltech.hire.trakstar.com/jobfeeds/soltech";

export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function stripCdata(text: string): string {
  const match = text.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return match ? match[1].trim() : text.trim();
}

export function extractXmlTag(
  itemXml: string,
  tag: string,
): string | undefined {
  const match = itemXml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  if (!match) return undefined;
  const value = decodeXmlEntities(stripCdata(match[1]));
  return value || undefined;
}

export async function fetchSoltechJobs(): Promise<JobPosting[]> {
  const response = await fetch(SOLTECH_RSS_URL);
  const xml = await response.text();
  const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item) => {
      const title = extractXmlTag(item, "title") ?? "";
      const link = extractXmlTag(item, "link") ?? "";
      const guid = extractXmlTag(item, "guid") ?? link;
      return {
        key: `soltech:${guid}`,
        title,
        url: link,
        company: "SOLTECH",
        postedAt: extractXmlTag(item, "pubDate"),
        description: extractXmlTag(item, "description"),
      };
    })
    .filter((job) => job.title && job.url && matchesAnyTitle(job.title));
}

const STATHEROS_BASE_URL = "https://statheros.freshteam.com";

export async function fetchStatherosJobs(): Promise<JobPosting[]> {
  const response = await fetch(`${STATHEROS_BASE_URL}/jobs`);
  const html = await response.text();
  const blocks = html.match(/<a href="\/jobs\/[\s\S]*?<\/a>/g) ?? [];
  return blocks
    .map((block) => {
      const hrefMatch = block.match(/href="(\/jobs\/[^"]+)"/);
      const titleMatch = block.match(
        /<div class="job-title">([\s\S]*?)<\/div>/,
      );
      const descMatch = block.match(
        /<div\s+class="job-desc text">([\s\S]*?)<\/div>/,
      );
      const locationMatch = block.match(/data-portal-location="([^"]*)"/);
      const remoteMatch = block.match(
        /data-portal-remote-location=(true|false)/,
      );
      const href = hrefMatch ? hrefMatch[1] : "";
      const title = titleMatch ? titleMatch[1].trim() : "";
      const description = descMatch
        ? descMatch[1].replace(/\s+/g, " ").trim()
        : undefined;
      return {
        key: `statheros:${href}`,
        title,
        url: href ? `${STATHEROS_BASE_URL}${href}` : "",
        company: "Statheros",
        location: locationMatch ? locationMatch[1].trim() : undefined,
        description,
        yearsRequired: extractYearsRequired(description),
        workArrangement: remoteMatch
          ? remoteMatch[1] === "true"
            ? "remote"
            : "onsite"
          : undefined,
      };
    })
    .filter((job) => job.title && job.url && matchesAnyTitle(job.title));
}

export async function fetchQuarterhillJobs(): Promise<JobPosting[]> {
  const response = await fetch(
    "https://careers.quarterhill.com/api/jobs?page=1&sortBy=relevance&descending=false&internal=false",
  );
  const data = await response.json();
  const entries = data.jobs ?? [];
  return entries
    .map((entry: any) => entry.data)
    .filter((job: any) => job && matchesAnyTitle(job.title ?? ""))
    .map((job: any) => ({
      key: `qh:${job.slug}`,
      title: job.title,
      url: job.canonical_url ?? job.apply_url,
      company: "Quarterhill",
      location: job.location_name,
      postedAt: job.posted_date,
      salaryRange: formatSalaryRange(
        job.salary_min_value || undefined,
        job.salary_max_value || undefined,
      ),
    }));
}

export async function githubApi(
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

export async function fetchResumeCorpus(): Promise<string> {
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

export async function fetchContext(): Promise<string> {
  const data = await githubApi("CONTEXT.md");
  return Buffer.from(data.content, "base64").toString("utf-8");
}

export async function commitDraft(
  slug: string,
  content: string,
): Promise<void> {
  await githubApi(`drafts/${slug}.md`, {
    method: "PUT",
    body: JSON.stringify({
      message: `add draft resume for ${slug}`,
      content: Buffer.from(content, "utf-8").toString("base64"),
    }),
  });
}

export async function fetchResumeFiles(): Promise<Map<string, string>> {
  const files = await githubApi("resumes");
  const readable = files.filter((f: any) => f.type === "file");
  const entries = await Promise.all(
    readable.map(async (file: any) => {
      const data = await githubApi(`resumes/${file.name}`);
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return [file.name, content] as [string, string];
    }),
  );
  return new Map(entries);
}

export async function commitTemplateDraft(
  slug: string,
  content: string,
): Promise<void> {
  await githubApi(`template-drafts/${slug}.md`, {
    method: "PUT",
    body: JSON.stringify({
      message: `add template draft for ${slug}`,
      content: Buffer.from(content, "utf-8").toString("base64"),
    }),
  });
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "via",
  "using",
  "used",
  "use",
  "level",
  "one",
  "two",
  "some",
  "any",
  "not",
  "but",
  "also",
  "into",
  "from",
  "this",
  "experience",
  "exposure",
  "project",
  "projects",
  "confirmed",
  "context",
  "years",
  "year",
  "production",
  "personal",
  "record",
  "scope",
  "depth",
  "worth",
  "prior",
  "etc",
  "beyond",
  "flagged",
  "review",
  "mark",
  "your",
  "answer",
  "delete",
  "question",
  "comfortable",
  "writing",
  "directly",
  "mostly",
  "mediated",
  "distinct",
  "familiarity",
  "you",
  "our",
  "team",
  "role",
  "work",
  "will",
  "have",
  "are",
  "that",
]);

export function significantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9#+\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const shortAllowlist = new Set([
    "ai",
    "js",
    "ts",
    "db",
    "ui",
    "ux",
    "ci",
    "cd",
    "r2",
  ]);
  return new Set(
    words.filter(
      (w) => (w.length > 2 || shortAllowlist.has(w)) && !STOP_WORDS.has(w),
    ),
  );
}

export function extractUnconfirmedTerms(contextMd: string): Set<string> {
  const sectionMatch = contextMd.match(
    /## Master Skill Inventory([\s\S]*?)(?=\n## [^\n]|$)/,
  );
  const section = sectionMatch ? sectionMatch[1] : "";
  const unconfirmedMatch = section.match(
    /### Unconfirmed[\s\S]*?(?=\n### |\n## |$)/,
  );
  const unconfirmedText = unconfirmedMatch ? unconfirmedMatch[0] : "";
  const confirmedText = section.replace(unconfirmedText, "");
  const unconfirmedBody = unconfirmedText.replace(/^###\s*Unconfirmed\s*/i, "");
  const unconfirmedWords = significantWords(unconfirmedBody);
  const confirmedWords = significantWords(confirmedText);
  return new Set([...unconfirmedWords].filter((w) => !confirmedWords.has(w)));
}

export function buildCoverLetter(
  job: JobPosting,
  matchedTerms: string[],
): string {
  const company = job.company ?? "the team";
  const highlight =
    matchedTerms.slice(0, 3).join(", ") || "test automation and QA engineering";
  return [
    `Dear Hiring Team at ${company},`,
    "",
    `I'm writing to apply for the ${job.title} position. Over 22 years in software, the last several building and owning test automation end to end, I've developed hands-on depth in ${highlight} that lines up closely with what you're looking for.`,
    "",
    "I'd welcome the chance to talk through how that background could contribute to your team.",
    "",
    "Best,",
    "James R. Myers Jr.",
  ].join("\n");
}

export function buildTemplateDraft(
  job: JobPosting,
  resumes: Map<string, string>,
  contextMd: string,
): string | undefined {
  if (resumes.size === 0) return undefined;
  const jobWords = significantWords(`${job.title} ${job.description ?? ""}`);
  const resumeWordSets = new Map<string, Set<string>>();
  const wordDocFreq = new Map<string, number>();
  for (const [name, content] of resumes) {
    const words = significantWords(content);
    resumeWordSets.set(name, words);
    for (const w of words) wordDocFreq.set(w, (wordDocFreq.get(w) ?? 0) + 1);
  }
  let bestName = "";
  let bestScore = -1;
  let bestMatched: string[] = [];
  for (const [name, words] of resumeWordSets) {
    let score = 0;
    const matched: string[] = [];
    for (const w of jobWords) {
      if (words.has(w)) {
        const weight = 1 / (wordDocFreq.get(w) ?? 1);
        score += weight;
        if (weight > 0.3) matched.push(w);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestName = name;
      bestMatched = matched;
    }
  }
  const bestContent = resumes.get(bestName) ?? "";
  const unconfirmed = extractUnconfirmedTerms(contextMd);
  const gaps = [...jobWords].filter((w) => unconfirmed.has(w));
  const coverLetter = buildCoverLetter(job, bestMatched);
  const header = [
    "# TEMPLATE DRAFT (mechanically matched by keyword overlap, not AI-generated)",
    "",
    `Resume selected: **${bestName}** (matched on: ${bestMatched.slice(0, 8).join(", ") || "shared/common skills only, see note below"})`,
    gaps.length > 0
      ? `⚠ Possible skill gaps flagged from CONTEXT.md's Unconfirmed list: ${gaps.join(", ")} — verify before sending.`
      : "No flagged gaps against the Unconfirmed skill list.",
    "",
    bestMatched.length === 0
      ? "Note: matched broadly on skills shared across all resume variants — nothing stood out as strongly distinguishing for this specific posting."
      : "",
    "",
    "---",
    "",
  ].join("\n");
  return `${header}${bestContent}\n\n---\n\n## Cover Letter (draft)\n\n${coverLetter}\n`;
}

export function slugify(job: JobPosting): string {
  const date = new Date().toISOString().slice(0, 10);
  const base = `${job.company ?? "unknown"}-${job.title}-${date}`;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface AiProviderConfig {
  format: "anthropic" | "openai";
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}

export function resolveProvider(
  tier: "PREFILTER" | "DRAFT",
  fallbackModel: string,
): AiProviderConfig {
  const format =
    (process.env[`${tier}_PROVIDER_FORMAT`] as
      "anthropic" | "openai" | undefined) ?? "anthropic";
  const defaultBaseUrl =
    format === "anthropic"
      ? "https://api.anthropic.com/v1/messages"
      : "https://api.groq.com/openai/v1/chat/completions";
  const baseUrl = process.env[`${tier}_BASE_URL`] ?? defaultBaseUrl;
  const apiKey =
    process.env[`${tier}_API_KEY`] ??
    (format === "anthropic" ? process.env.ANTHROPIC_API_KEY : undefined);
  const model = process.env[`${tier}_MODEL`] ?? fallbackModel;
  return { format, baseUrl, apiKey, model };
}

export async function callAiModel(
  system: string,
  prompt: string,
  tier: "PREFILTER" | "DRAFT",
  maxTokens: number,
  fallbackModel: string,
): Promise<string> {
  const config = resolveProvider(tier, fallbackModel);
  if (!config.apiKey) {
    console.log(`${tier}: no API key configured, skipping call`);
    return "";
  }
  if (config.format === "anthropic") {
    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (data.usage)
      console.log(
        `${config.model} usage: ${data.usage.input_tokens} in / ${data.usage.output_tokens} out`,
      );
    const textBlock = data.content?.find((block: any) => block.type === "text");
    return textBlock?.text ?? "";
  }
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await response.json();
  if (data.usage)
    console.log(
      `${config.model} usage: ${data.usage.prompt_tokens} in / ${data.usage.completion_tokens} out`,
    );
  return data.choices?.[0]?.message?.content ?? "";
}

export async function prefilterJob(job: JobPosting): Promise<boolean> {
  const descriptionLine = job.description
    ? `\nDescription: ${job.description.slice(0, 1000)}`
    : "";
  const prompt = `Title: ${job.title}\nCompany: ${job.company ?? "unknown"}\nLocation: ${job.location ?? "unknown"}${descriptionLine}\n\nIs this a genuine match for a QA Automation Engineer / SDET with 22 years of enterprise software experience and 5 years of test automation (Playwright/TypeScript, Selenium, REST API testing)? Reply with only "yes" or "no".`;
  const result = await callAiModel(
    "You are screening job postings for relevance. Reply with only yes or no.",
    prompt,
    "PREFILTER",
    10,
    PREFILTER_MODEL,
  );
  return result.trim().toLowerCase().startsWith("y");
}

export async function draftResume(
  job: JobPosting,
  corpus: string,
  context: string,
): Promise<string> {
  const descriptionLine = job.description
    ? `\nDescription: ${job.description}`
    : "";
  const prompt = `Job posting:\nTitle: ${job.title}\nCompany: ${job.company ?? "unknown"}\nLocation: ${job.location ?? "unknown"}${descriptionLine}\n\nContext and framing rules:\n${context}\n\nPast resume corpus:\n${corpus}\n\nDraft a tailored two-page resume for this posting, following the framing rules exactly. If anything about the fit is genuinely ambiguous, flag it clearly at the top under a "NEEDS REVIEW" heading instead of guessing.`;
  return callAiModel(
    "You are drafting a tailored resume from an existing corpus and framing rules.",
    prompt,
    "DRAFT",
    DRAFT_MAX_TOKENS,
    DRAFT_MODEL,
  );
}

export function loadSeenJobs(): { seen: Set<string>; isFirstRun: boolean } {
  try {
    const raw = readFileSync(SEEN_JOBS_PATH, "utf-8");
    return { seen: new Set(JSON.parse(raw)), isFirstRun: false };
  } catch {
    return { seen: new Set(), isFirstRun: true };
  }
}

export function saveSeenJobs(seen: Set<string>) {
  writeFileSync(SEEN_JOBS_PATH, JSON.stringify([...seen], null, 2));
}

const TRACKER_PATH = "application-tracker.json";

export function loadTracker(): Record<string, TrackerEntry> {
  try {
    const raw = readFileSync(TRACKER_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveTracker(tracker: Record<string, TrackerEntry>) {
  writeFileSync(TRACKER_PATH, JSON.stringify(tracker, null, 2));
}

export function recordAlerts(jobs: JobPosting[]) {
  const tracker = loadTracker();
  const now = new Date().toISOString();
  for (const job of jobs) {
    if (!tracker[job.key]) {
      tracker[job.key] = {
        title: job.title,
        company: job.company,
        postedAt: job.postedAt,
        alertedAt: now,
      };
    }
  }
  saveTracker(tracker);
}

export function isDigestSource(job: JobPosting): boolean {
  return DIGEST_SOURCES.has(job.key.split(":")[0]);
}

export function loadDigestState(): DigestState {
  try {
    const raw = readFileSync(DIGEST_STATE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { queue: [] };
  }
}

export function saveDigestState(state: DigestState) {
  writeFileSync(DIGEST_STATE_PATH, JSON.stringify(state, null, 2));
}

export function buildDigestEmailHtml(jobs: JobPosting[]): {
  subject: string;
  html: string;
} {
  const sorted = [...jobs].sort((a, b) => scoreJob(b) - scoreJob(a));
  const listHtml = sorted
    .map((job) => {
      const status = historyStatus(job.company);
      const statusTag = status && status !== "active" ? ` [${status}]` : "";
      const draftTag = job.templateDraftUrl
        ? ` — <a href="${job.templateDraftUrl}">template draft</a>`
        : "";
      return `<li>[${sourceLabel(job.key)}] <a href="${job.url}">${job.title}</a> — ${job.company ?? "unknown company"}${statusTag} — ${job.location ?? "location unknown"} — ${daysAgoLabel(job.postedAt)}${draftTag}</li>`;
    })
    .join("");
  const jobWord = jobs.length === 1 ? "job posting" : "job postings";
  return {
    subject: `Daily digest: ${jobs.length} RemoteOK/Adzuna ${jobWord}`,
    html: `<p>Lower-confidence postings from the last day, batched instead of real-time.</p><ul>${listHtml}</ul>`,
  };
}

async function sendDigestEmail(jobs: JobPosting[]) {
  const { subject, html } = buildDigestEmailHtml(jobs);
  await resend.emails.send({
    from: process.env.FROM_EMAIL as string,
    to: process.env.TO_EMAIL as string,
    subject,
    html,
  });
}

export function sourceLabel(key: string): string {
  const prefix = key.split(":")[0];
  const labels: Record<string, string> = {
    tn: "TherapyNotes",
    wk: "Workable",
    gh: "Greenhouse",
    lv: "Lever",
    ab: "Ashby",
    soltech: "SOLTECH",
    statheros: "Statheros",
    qh: "Quarterhill",
    rok: "RemoteOK",
    az: "Adzuna",
    usaj: "USAJOBS",
  };
  return labels[prefix] ?? prefix;
}

export function buildAlertEmailHtml(
  newJobs: JobPosting[],
  drafts: Map<string, string>,
): { subject: string; html: string } {
  const listHtml = newJobs
    .map((job) => {
      const status = historyStatus(job.company);
      const statusTag = status && status !== "active" ? ` [${status}]` : "";
      const fireTag = scoreJob(job) >= FIRE_SCORE_THRESHOLD ? "🔥 " : "";
      const salarySegment = job.salaryRange ? ` — ${job.salaryRange}` : "";
      const yearsSegment = job.yearsRequired ? ` — ${job.yearsRequired}` : "";
      const draftTag = drafts.has(job.key)
        ? " — AI draft attached"
        : job.templateDraftUrl
          ? ` — <a href="${job.templateDraftUrl}">template draft</a>`
          : "";
      return `<li>${fireTag}[${sourceLabel(job.key)}] <a href="${job.url}">${job.title}</a> — ${job.company ?? "unknown company"}${statusTag} — ${job.location ?? "location unknown"}${salarySegment}${yearsSegment} — ${daysAgoLabel(job.postedAt)}${draftTag}</li>`;
    })
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
  return {
    subject: `${newJobs.length} new ${jobWord} found`,
    html: `${summary}<ul>${listHtml}</ul>`,
  };
}

async function sendAlertEmail(
  newJobs: JobPosting[],
  drafts: Map<string, string>,
) {
  const { subject, html } = buildAlertEmailHtml(newJobs, drafts);
  const attachments = newJobs
    .filter((job) => drafts.has(job.key))
    .map((job) => ({
      filename: `${slugify(job)}.md`,
      content: Buffer.from(drafts.get(job.key) as string, "utf-8"),
    }));
  await resend.emails.send({
    from: process.env.FROM_EMAIL as string,
    to: process.env.TO_EMAIL as string,
    subject,
    html,
    attachments,
  });
}

export async function safely<T>(
  promise: Promise<T[]>,
  label: string,
): Promise<T[]> {
  try {
    return await promise;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return [];
  }
}

export async function safelyValue<T>(
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

export async function safelyRun(
  promise: Promise<void>,
  label: string,
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    console.error(`${label} failed:`, err);
  }
}

export async function main() {
  const [
    therapyNotesJobs,
    titleSearchJobs,
    greenhouseJobs,
    leverJobs,
    ashbyJobs,
    remoteOkJobs,
    adzunaJobs,
    usaJobs,
    soltechJobs,
    statherosJobs,
    quarterhillJobs,
  ] = await Promise.all([
    safely(fetchTherapyNotesJobs(), "TherapyNotes"),
    safely(fetchAllTitleSearchJobs(), "Workable title search"),
    safely(fetchAllGreenhouseJobs(), "Greenhouse"),
    safely(fetchAllLeverJobs(), "Lever"),
    safely(fetchAllAshbyJobs(), "Ashby"),
    safely(fetchRemoteOKJobs(), "RemoteOK"),
    safely(fetchAllAdzunaJobs(), "Adzuna"),
    safely(fetchAllUSAJobs(), "USAJOBS"),
    safely(fetchSoltechJobs(), "SOLTECH"),
    safely(fetchStatherosJobs(), "Statheros"),
    safely(fetchQuarterhillJobs(), "Quarterhill"),
  ]);

  const allJobs = dedupeBySignature(
    [
      ...therapyNotesJobs,
      ...titleSearchJobs,
      ...greenhouseJobs,
      ...leverJobs,
      ...ashbyJobs,
      ...remoteOkJobs,
      ...adzunaJobs,
      ...usaJobs,
      ...soltechJobs,
      ...statherosJobs,
      ...quarterhillJobs,
    ]
      .filter(isRemoteJob)
      .filter(isFreshJob),
  );

  const { seen, isFirstRun } = loadSeenJobs();
  const newJobs = allJobs
    .filter((job) => !seen.has(job.key))
    .sort((a, b) => scoreJob(b) - scoreJob(a));
  const immediateJobs = newJobs.filter((job) => !isDigestSource(job));
  const digestJobs = newJobs.filter((job) => isDigestSource(job));

  const digestState = loadDigestState();
  if (!isFirstRun && digestJobs.length > 0) {
    digestState.queue.push(...digestJobs);
  }

  if (!isFirstRun && newJobs.length > 0) {
    const templateContext = await safelyValue(
      fetchContext(),
      "fetchContext (template)",
      "",
    );
    const templateResumes = await safelyValue(
      fetchResumeFiles(),
      "fetchResumeFiles",
      new Map<string, string>(),
    );
    if (templateContext && templateResumes.size > 0) {
      for (const job of newJobs) {
        const draft = buildTemplateDraft(job, templateResumes, templateContext);
        if (!draft) continue;
        const slug = slugify(job);
        await safelyRun(
          commitTemplateDraft(slug, draft),
          `commitTemplateDraft ${job.key}`,
        );
        job.templateDraftUrl = `https://github.com/${RESUME_VAULT_REPO}/blob/main/template-drafts/${slug}.md`;
      }
    }
  }

  if (immediateJobs.length > 0 && !isFirstRun) {
    const drafts = new Map<string, string>();
    if (AI_PIPELINE_ENABLED) {
      const context = await safelyValue(fetchContext(), "fetchContext", "");
      const corpus = await safelyValue(
        fetchResumeCorpus(),
        "fetchResumeCorpus",
        "",
      );
      if (context && corpus) {
        for (const job of immediateJobs) {
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
    await sendAlertEmail(immediateJobs, drafts);
    console.log(`Sent alert for ${immediateJobs.length} new job(s)`);
    recordAlerts(immediateJobs);
  } else {
    console.log(
      isFirstRun
        ? "First run, baselining current jobs"
        : "No new immediate jobs",
    );
  }

  if (!digestState.lastSentAt) {
    digestState.lastSentAt = new Date().toISOString();
  }
  const hoursSinceDigest =
    (Date.now() - new Date(digestState.lastSentAt).getTime()) / 3600000;
  if (
    !isFirstRun &&
    digestState.queue.length > 0 &&
    hoursSinceDigest >= DIGEST_INTERVAL_HOURS
  ) {
    await sendDigestEmail(digestState.queue);
    recordAlerts(digestState.queue);
    console.log(`Sent digest for ${digestState.queue.length} job(s)`);
    digestState.queue = [];
    digestState.lastSentAt = new Date().toISOString();
  }
  if (!isFirstRun) saveDigestState(digestState);
  if (!isFirstRun) saveTracker(loadTracker());

  if (newJobs.length > 0 || isFirstRun) {
    for (const job of newJobs) seen.add(job.key);
    saveSeenJobs(seen);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

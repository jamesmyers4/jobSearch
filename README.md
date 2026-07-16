# TherapyNotes Job Checker

![Check TherapyNotes Jobs](https://github.com/jamesmyers4/jobSearch/actions/workflows/check-jobs.yml/badge.svg)

Checks ten public job-board sources every 30 minutes and emails an alert when a genuinely new, remote, title-matched posting shows up — TherapyNotes' own board, a cross-company title search on Workable, optional per-company Greenhouse/Lever/Ashby boards, RemoteOK, Adzuna, USAJOBS, SOLTECH, and Statheros. Designed to run almost entirely free: filtering, deduping, scoring, and a mechanically-matched resume/cover-letter draft happen for every job with zero API calls. An optional AI layer (cheap/free by default, Anthropic available as a manual upgrade) adds a second-opinion prefilter and, for a narrow allowlist of companies, a fully AI-drafted resume.

## How it works

- `check-jobs.ts` fetches all ten sources in parallel every run.
- Results are filtered to remote-only postings, filtered by freshness (nothing older than `MAX_ALERT_AGE_DAYS`, currently 7 days), deduped across sources by normalized company+title, and scored by a source-credibility + title-match + freshness + keyword formula — the score drives both display order and a 🔥 tag on standout postings (score ≥ `FIRE_SCORE_THRESHOLD`, currently 45).
- Compared against `seen-jobs.json` (committed in this repo) to find anything not seen before. First run ever just records the current list as a baseline — no email, since those roles were already open before monitoring started.
- TherapyNotes, Workable, Greenhouse, Lever, Ashby, USAJOBS, SOLTECH, and Statheros alert in real time. RemoteOK and Adzuna — the two least precise sources — batch into a digest instead, sent at most once every `DIGEST_INTERVAL_HOURS` (currently 12).
- `company-history.json` tracks per-company application history and a current `status`: `"active"` (default — shows up and scores normally), `"caution"` (deprioritized, tagged inline, and suppressed from AI drafting, but still shown — so a re-posted role at a company with an ambiguous outcome doesn't quietly burn API spend), or `"blocked"` (removed from the pipeline entirely — no email, no scoring — for a company you've explicitly decided you don't want to hear from again).
- Every alerted job — real-time or digest — gets a mechanically-matched resume and cover letter committed to `template-drafts/` in the `resume-vault` repo, picked by keyword overlap against your actual resume corpus, no AI required. A much smaller, allowlist-gated subset also gets a fully AI-drafted version in `drafts/`, capped at `MAX_DRAFTS_PER_RUN` (currently 3) per run.
- Each emailed job shows title, company, location, a "posted X days ago" label, salary (where the source provides structured data), and years-required (regex-extracted from the description where available).
- Every run commits three files back to the repo: `seen-jobs.json`, `application-tracker.json`, and `digest-state.json`.

## Sources — real-time

| Source                        | Coverage                                                              | Posted-date field used                                       |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| TherapyNotes' Workable board  | Every role at TherapyNotes directly                                   | Unconfirmed — falls back to "posted date unknown"            |
| Workable cross-company search | Every Workable-hosted company, one query per entry in `SEARCH_TITLES` | `updatedAt`                                                  |
| Greenhouse                    | Per-company, add slugs to `GREENHOUSE_COMPANIES`                      | `updated_at`                                                 |
| Lever                         | Per-company, add slugs to `LEVER_COMPANIES`                           | `createdAt`                                                  |
| Ashby                         | Per-company, add slugs to `ASHBY_COMPANIES`                           | `publishedAt`                                                |
| USAJOBS                       | Official federal job postings, keyword search via `USAJOBS_KEYWORDS`  | `PublicationStartDate`                                       |
| SOLTECH                       | Direct RSS feed, most robust source in the pipeline                   | `pubDate`                                                     |
| Statheros                     | Freshteam career-page scrape — most fragile source; depends on their exact HTML structure, unlike the API/RSS-based sources | Not provided by the source            |

## Sources — daily digest

| Source    | Coverage                                                              | Posted-date field used                                       |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| RemoteOK  | Entire remote-jobs feed, filtered client-side against `SEARCH_TITLES` | `date` — unconfirmed, may fall back to "posted date unknown" |
| Adzuna    | Broad job aggregator; noisiest source, but also the most active overnight | `created`                                                 |

Greenhouse, Lever, and Ashby fields are confirmed against official docs. Workable's cross-company search, TherapyNotes' own widget endpoint, and RemoteOK are less officially documented — if a date or link ever looks wrong in an email, that's the place to check first.

## Editing the title search

`SEARCH_TITLES` in `check-jobs.ts` is a plain array covering seniority variants (Senior/Lead/Staff) across SDET, QA Automation Engineer, Test Automation Engineer, Software Development Engineer in Test, Quality/QA/Test Engineer, and Automation Engineer/Architect. Add, remove, or reword entries directly — this same array filters the Workable cross-company search, the RemoteOK feed, USAJOBS, SOLTECH, Statheros, and every Greenhouse/Lever/Ashby company board, so one edit updates matching everywhere.

Each title only pulls the first page of Workable search results (up to 20 matches). Broad titles like "Quality Engineer" will surface some noise — manufacturing/QC roles, not just software — that's the tradeoff of full-text search, not a bug.

## Adding company slugs for Greenhouse / Lever / Ashby

If a company you're tracking runs on one of these three, you can spot it fast: go to their careers page, click into any open role, and look at the URL.

- `job-boards.greenhouse.io/{company}/jobs/...` → add `{company}` to `GREENHOUSE_COMPANIES`
- `jobs.lever.co/{company}/...` → add `{company}` to `LEVER_COMPANIES`
- `jobs.ashbyhq.com/{company}/...` → add `{company}` to `ASHBY_COMPANIES`

Confirmed so far: QA Wolf → Ashby (`QAWolf`), Impiricus → Greenhouse (`impiricus`).

If the URL shows something else (Workday, iCIMS, BambooHR, a custom site), that company isn't reachable this way — those platforms don't offer public no-auth endpoints like this. Confirmed unreachable: Quarterhill (iCIMS-branded, but the actual careers page loads job listings via client-side JavaScript — a plain fetch sees an empty shell; would need a headless browser to render, [treeLine](https://github.com/jamesmyers4/treeLine)'s Playwright/Patchright capture layer is the candidate if this ever gets revisited — their `robots.txt` explicitly allows crawling with a 5-second `crawl-delay`, so there's no policy blocker, just a technical one). SOLTECH and Statheros looked unreachable by this method too, but both have dedicated fetchers elsewhere in the code instead (see the sources tables above).

## The AI layer

Everything above this line runs with zero API calls. On top of it, two optional, independently-configurable AI tiers exist purely to add judgment a keyword filter can't:

- **Prefilter** — a cheap yes/no relevance check before a full AI draft is attempted. Currently configured to run on Groq (free tier, no card required) instead of Anthropic.
- **Draft** — a fully AI-written resume, reserved for `AI_DRAFT_COMPANY_ALLOWLIST` (currently just `["TherapyNotes"]`) to control cost, since this is the expensive tier.

Both are controlled independently via `{TIER}_PROVIDER_FORMAT`, `{TIER}_BASE_URL`, `{TIER}_MODEL`, and `{TIER}_API_KEY` env vars (`PREFILTER_*` / `DRAFT_*`). Leaving a tier's vars unset falls back to Anthropic using `ANTHROPIC_API_KEY` — the default, original behavior. The whole layer can also be switched off entirely via `AI_PIPELINE_ENABLED`, in which case only the free template-kit draft still runs.

## Environment variables

Required:

| Variable         | Purpose                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Resend API key used to send the alert email                                                                                   |
| `FROM_EMAIL`     | Sender address — `onboarding@resend.dev` works with no domain verified, but only delivers to the email on your Resend account |
| `TO_EMAIL`       | Where the alert email goes                                                                                                    |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Adzuna API credentials                                                                                       |
| `USAJOBS_EMAIL` / `USAJOBS_AUTH_KEY` | USAJOBS API credentials                                                                                   |
| `RESUME_VAULT_TOKEN` | GitHub token with write access to the `resume-vault` repo — needed for the free template-kit draft, not just the AI one |

Optional (AI layer only):

| Variable         | Purpose                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `AI_PIPELINE_ENABLED` | Repo **variable** (not secret) — `"true"` turns on the AI prefilter/draft layer entirely                                |
| `ANTHROPIC_API_KEY` | Default provider for both AI tiers if no `PREFILTER_*`/`DRAFT_*` override is set                                          |
| `PREFILTER_PROVIDER_FORMAT`, `PREFILTER_BASE_URL`, `PREFILTER_MODEL`, `PREFILTER_API_KEY` | Point the prefilter tier at a different provider (currently Groq) instead of Anthropic |
| `DRAFT_PROVIDER_FORMAT`, `DRAFT_BASE_URL`, `DRAFT_MODEL`, `DRAFT_API_KEY` | Same, for the draft tier — unset today, so this tier still uses Anthropic          |

## Running on GitHub Actions (recommended)

1. Push this repo to GitHub (private is fine).
2. Settings → Secrets and variables → Actions → add every secret from the tables above, plus `AI_PIPELINE_ENABLED` as a repo **variable**.
3. Settings → Actions → General → Workflow permissions → "Read and write permissions" — needed for the workflow to commit `seen-jobs.json`, `application-tracker.json`, and `digest-state.json` back to the repo. If `.github/workflows/check-jobs.yml`'s `file_pattern` ever gets edited, make sure all three filenames stay listed — dropping one causes the whole commit step to fail with a pathspec error, even for the other two files, since `git add` runs against all three as one command.
4. Actions tab → "Check TherapyNotes Jobs" → "Run workflow" once, to trigger the first silent baseline run.
5. After that it runs automatically every 30 minutes via the cron schedule in `.github/workflows/check-jobs.yml`.

## Running locally (optional)

1. Copy `.env.example` to `.env` and fill in the variables you need.
2. `npm install`
3. `npm run check`

`.env` is git-ignored and never gets committed. The script's `dotenv/config` import only affects local runs — GitHub Actions ignores it and reads secrets directly.

## Tracking real turnaround time

Every job that actually gets alerted (real-time or digest) gets a `postedAt`/`alertedAt` entry in `application-tracker.json`. Whenever you actually submit an application somewhere, run:

```
node mark-submitted.js <title or company keyword>
```

It finds the matching unsubmitted entry, stamps `submittedAt`, and prints your real turnaround time — hours from alert to submission, days from posting to submission. If your search matches more than one open entry it lists them instead of guessing. This is a permanent tool, not a one-time script — keep it in the repo and run it by hand each time you apply somewhere.

## Testing that email delivery actually works

Since the very first run only baselines (no email), the fastest way to confirm Resend is wired correctly is to force a real send: edit `seen-jobs.json` to just `["test-placeholder"]`, commit it, then run the workflow again. Every currently open job across all real-time sources will look "new," triggering a real email. `application-tracker.json` and `digest-state.json` don't need to be touched for this test. The next normal run overwrites `seen-jobs.json` with the accurate current list afterward — no manual cleanup needed.

## Maintenance notes

- **60-day inactivity**: GitHub disables scheduled workflows in a repo after 60 days with no commit activity. If nothing new gets posted for two months, this could quietly go inactive — either re-trigger manually from the Actions tab or make any small commit every ~50 days to reset the clock.
- **`seen-jobs.json` only grows**: keys are never removed, even after a job closes. Harmless, but the file will slowly grow over time rather than reflecting only currently-open roles.
- **Statheros is the most fragile source**: it depends on Freshteam's specific HTML structure rather than a stable API or RSS feed. If it ever silently starts returning zero jobs, a page redesign on their end is the first thing to check.

## Adjusting frequency

Change the cron in `.github/workflows/check-jobs.yml`. `*/30 * * * *` is every 30 minutes; `*/15 * * * *` gets you every 15 if you want it tighter. GitHub Actions schedules can run a few minutes late during high load, but every source here is cheap enough to poll frequently without rate-limit concerns. A future browser-based source (if Quarterhill ever gets built via treeLine) shouldn't share this cadence — a full headless browser is much heavier than everything else here and would make more sense on its own, much less frequent schedule.

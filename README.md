# TherapyNotes Job Checker

![Check TherapyNotes Jobs](https://github.com/jamesmyers4/jobSearch/actions/workflows/check-jobs.yml/badge.svg)

Checks ten public job-board sources every 30 minutes and emails an alert the moment a genuinely new posting shows up — TherapyNotes' own board, a cross-company title search on Workable, optional per-company Greenhouse/Lever/Ashby boards, and RemoteOK.

## How it works

- `check-jobs.ts` fetches all six sources in parallel every run.
- Results are merged, deduped, and compared against `seen-jobs.json` (committed in this repo) to find anything not seen before.
- First run ever just records the current list as a baseline — no email, since those roles were already open before monitoring started.
- Every run after that emails you via Resend if anything new shows up, then commits the updated `seen-jobs.json` back to the repo.
- Each emailed job includes a title, company, location, and a "posted X days ago" label where the source provides one — useful for telling a truly new posting apart from an old one that got relisted and only looks new to this checker.
- RemoteOK/Adzuna now batch into a daily digest instead of firing every 30 minutes.

## Sources checked every run

| Source                        | Coverage                                                              | Posted-date field used                                       |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| TherapyNotes' Workable board  | Every role at TherapyNotes directly                                   | Unconfirmed — falls back to "posted date unknown"            |
| Workable cross-company search | Every Workable-hosted company, one query per entry in `SEARCH_TITLES` | `updatedAt`                                                  |
| Greenhouse                    | Per-company, add slugs to `GREENHOUSE_COMPANIES`                      | `updated_at`                                                 |
| Lever                         | Per-company, add slugs to `LEVER_COMPANIES`                           | `createdAt`                                                  |
| Ashby                         | Per-company, add slugs to `ASHBY_COMPANIES`                           | `publishedAt`                                                |
| RemoteOK                      | Entire remote-jobs feed, filtered client-side against `SEARCH_TITLES` | `date` — unconfirmed, may fall back to "posted date unknown" |
| Adzuna
| USA Jobs
| SOLTECH
| Statheros

Greenhouse, Lever, and Ashby fields are confirmed against official docs. Workable's cross-company search, TherapyNotes' own widget endpoint, and RemoteOK are less officially documented — if a date or link ever looks wrong in an email, that's the place to check first.

## Editing the title search

`SEARCH_TITLES` in `check-jobs.ts` is a plain array covering seniority variants (Senior/Lead/Staff) across SDET, QA Automation Engineer, Test Automation Engineer, Software Development Engineer in Test, Quality/QA/Test Engineer, and Automation Engineer/Architect. Add, remove, or reword entries directly — this same array filters the Workable cross-company search, the RemoteOK feed, and every Greenhouse/Lever/Ashby company board, so one edit updates matching everywhere.

Each title only pulls the first page of Workable search results (up to 20 matches). Broad titles like "Quality Engineer" will surface some noise — manufacturing/QC roles, not just software — that's the tradeoff of full-text search, not a bug.

## Adding company slugs for Greenhouse / Lever / Ashby

If a company you're tracking (QA Wolf, Impiricus, Quarterhill, ITC, Statheros, SOLTECH, or anyone else) runs on one of these three, you can spot it fast: go to their careers page, click into any open role, and look at the URL.

- `job-boards.greenhouse.io/{company}/jobs/...` → add `{company}` to `GREENHOUSE_COMPANIES`
- `jobs.lever.co/{company}/...` → add `{company}` to `LEVER_COMPANIES`
- `jobs.ashbyhq.com/{company}/...` → add `{company}` to `ASHBY_COMPANIES`

If the URL shows something else (Workday, iCIMS, BambooHR, a custom site), that company isn't reachable this way — those platforms don't offer public no-auth endpoints like this.

## Environment variables

| Variable         | Purpose                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | Resend API key used to send the alert email                                                                                   |
| `FROM_EMAIL`     | Sender address — `onboarding@resend.dev` works with no domain verified, but only delivers to the email on your Resend account |
| `TO_EMAIL`       | Where the alert email goes                                                                                                    |

## Running on GitHub Actions (recommended)

1. Push this repo to GitHub (private is fine).
2. Settings → Secrets and variables → Actions → add all three variables above.
3. Actions tab → "Check TherapyNotes Jobs" → "Run workflow" once, to trigger the first silent baseline run.
4. After that it runs automatically every 30 minutes via the cron schedule in `.github/workflows/check-jobs.yml`.

Settings → Actions → General → Workflow permissions needs to be set to "Read and write permissions" for the workflow to be able to commit `seen-jobs.json` back to the repo.

## Running locally (optional)

1. Copy `.env.example` to `.env` and fill in the three variables above.
2. `npm install`
3. `npm run check`

`.env` is git-ignored and never gets committed. The script's `dotenv/config` import only affects local runs — GitHub Actions ignores it and reads secrets directly.

## Testing that email delivery actually works

Since the very first run only baselines (no email), the fastest way to confirm Resend is wired correctly is to force a real send: edit `seen-jobs.json` to just `["test-placeholder"]`, commit it, then run the workflow again. Every currently open job across all sources will look "new," triggering a real email. The next normal run overwrites the file with the accurate current list afterward — no manual cleanup needed.

## Maintenance notes

- **60-day inactivity**: GitHub disables scheduled workflows in a repo after 60 days with no commit activity. If nothing new gets posted for two months, this could quietly go inactive — either re-trigger manually from the Actions tab or make any small commit every ~50 days to reset the clock.
- **`seen-jobs.json` only grows**: keys are never removed, even after a job closes. Harmless, but the file will slowly grow over time rather than reflecting only currently-open roles.

## Adjusting frequency

Change the cron in `.github/workflows/check-jobs.yml`. `*/30 * * * *` is every 30 minutes; `*/15 * * * *` gets you every 15 if you want it tighter. GitHub Actions schedules can run a few minutes late during high load, but every source here is cheap enough to poll frequently without rate-limit concerns.

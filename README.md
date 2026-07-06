![Check TherapyNotes Jobs](https://github.com/{your-username}/{your-repo}/actions/workflows/check-jobs.yml/badge.svg)

# TherapyNotes Job Checker

Polls TherapyNotes' Workable-hosted careers board every 30 minutes and emails you the moment a new role goes live.

## How it works

- `check-jobs.ts` polls several public, no-auth job-board APIs every run (see "Sources checked every run" below).
- Results from all sources are merged, deduped, and compared against `seen-jobs.json` (committed in this repo) to find anything new.
- First run just records the current list as a baseline — no email, since those roles were already open before monitoring started.
- Every run after that emails you via Resend if anything new shows up, then commits the updated `seen-jobs.json` back to the repo.

## Sources checked every run

- **TherapyNotes' Workable board** — direct, no title filtering needed since it's every role at one company.
- **Workable cross-company search** — one query per entry in `SEARCH_TITLES`, covers every Workable-hosted company at once.
- **Greenhouse** — per-company, add slugs to `GREENHOUSE_COMPANIES`.
- **Lever** — per-company, add slugs to `LEVER_COMPANIES`.
- **Ashby** — per-company, add slugs to `ASHBY_COMPANIES`.
- **RemoteOK** — one call pulls their whole remote-jobs feed, filtered client-side against `SEARCH_TITLES` since RemoteOK's API doesn't support server-side keyword search.

## Finding company slugs for Greenhouse / Lever / Ashby

If a company you're tracking (QA Wolf, Impiricus, Quarterhill, ITC, Statheros, SOLTECH, or anyone else) uses one of these three, you can spot it fast: go to their careers page, click into any open role, and look at the URL.

- `job-boards.greenhouse.io/{company}/jobs/...` → add `{company}` to `GREENHOUSE_COMPANIES`
- `jobs.lever.co/{company}/...` → add `{company}` to `LEVER_COMPANIES`
- `jobs.ashbyhq.com/{company}/...` → add `{company}` to `ASHBY_COMPANIES`

If the URL shows something else entirely (Workday, iCIMS, BambooHR, a custom site), that company isn't on one of these four platforms and won't be catchable this way — those systems don't offer public no-auth endpoints like this.

## Field-shape caveat, same as before

Greenhouse's fields are well-documented and stable. Lever and Ashby's public endpoints are reliable but less officially documented, so the same advice applies: after adding a company, check the Actions log once to confirm the emailed link actually opens the right job posting. A quick `console.log(JSON.stringify(job))` inside the relevant fetch function for one run is the fastest way to see the real field names if something looks off.

## Editing the title search

`SEARCH_TITLES` in `check-jobs.ts` is just a plain array — add, remove, or reword entries to widen or narrow the net:

See the current list at the top of `check-jobs.ts` — it's grown to cover seniority variants (Senior/Lead/Staff) across SDET, QA Automation Engineer, Test Automation Engineer, SDET-in-Test, Quality/QA/Test Engineer, and Automation Engineer/Architect titles. This same array is reused to filter the RemoteOK feed and the Greenhouse/Lever/Ashby company boards, so one edit here updates matching across every source.

Each title only pulls the first page of results (up to 20 matches) from Workable's search. Broad titles like "Quality Engineer" will surface some noise — manufacturing/QC roles, not just software — that's the tradeoff of full-text search rather than a bug.

**One caveat on the cross-company search:** Workable's `jobs.workable.com/api/v1/jobs` response fields aren't as officially documented as the per-company widget endpoint. The script defends against a couple of possible field-name variants (`uuid` vs `id`, `url` vs `shortlink`, `company.name` vs `companyName`), but after the first run it's worth checking the Actions log output once to confirm the emailed links actually resolve correctly — if a field comes back `undefined`, that's a quick one-line fix in `fetchTitleSearchJobs`.

## Setup

1. Push this repo to GitHub (private repo is fine, this doesn't need to be public).
2. In repo Settings → Secrets and variables → Actions, add:
   - `RESEND_API_KEY` — your Resend API key
   - `FROM_EMAIL` — a verified sender on your Resend domain (e.g. `alerts@yourdomain.com`)
   - `TO_EMAIL` — where you want the alert sent
3. Go to the Actions tab, select "Check TherapyNotes Jobs", and click "Run workflow" once manually to trigger the first (silent) baseline run.
4. After that it runs automatically every 30 minutes via the cron schedule.

## Important caveat

GitHub disables scheduled workflows in a repo after 60 days with no commit activity. If TherapyNotes doesn't post anything new for two months, this workflow could quietly go inactive. To avoid that, every ~50 days either:

- manually re-trigger it once from the Actions tab, or
- make any small commit to the repo (even a README edit) to reset the clock.

## Adjusting frequency

Change the cron in `.github/workflows/check-jobs.yml`. `*/30 * * * *` is every 30 minutes. `*/15 * * * *` gets you every 15 minutes if you want it tighter — GitHub Actions schedules can run a few minutes late during high load, but this endpoint is cheap enough to poll frequently without any rate-limit concerns.

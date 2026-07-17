# Task: Separate personal data from code so this repo is safe to make public

## Context

This repo currently mixes application logic with personal job-search data — real names (hiring managers, recruiters), specific company notes, and speculation tied to real rejections. The goal is NOT to create a separate public fork and manually keep it in sync. The goal is to restructure so the working repo itself can safely go public: personal data lives only in files that are gitignored and never committed, every code path that reads those files degrades gracefully when they're absent, and each personal data file has a checked-in `.example.*` counterpart that demonstrates the shape with generic content.

`company-history.example.json` already exists and is the model to follow for any other file that needs one.

## Do not do without asking first

- Do not change GitHub repo visibility (public/private) — that decision is mine.
- Do not rewrite git history (no `git filter-repo`, no BFG, no force-push, no branch deletion) even if sensitive data turns up in past commits. Flag it in the report and stop there.
- Do not delete any data file outright. Gitignore it or move it — never delete without asking first.

## Tasks

1. Inventory every tracked file in the repo (`git ls-files`) and read each one for: real names, specific company outcome notes or speculation tied to a real event, email addresses, phone numbers, API keys/tokens, or anything else personally identifying.

2. For each sensitive file found, decide and report whether it should be fully gitignored as data-only (e.g. `company-history.json`, `seen-jobs.json`, `application-tracker.json`) and whether it needs a checked-in `.example.*` counterpart.

3. Update `.gitignore` to cover every sensitive data file identified — not just the ones already known about.

4. Check whether any sensitive file was ever committed in the past even though it's gitignored now (`git log --all --full-history -- <path>`). If anything turns up, list the exact files and commits. Do not attempt to fix this — just report it.

5. Audit every code path that reads a gitignored data file (starting with `check-jobs.ts`) and confirm it checks for file existence before reading, falls back to a safe default (e.g. no filtering applied) if the file is missing, and never throws or crashes in CI when the file is absent.

6. Create or refresh `.example.*` counterparts for every gitignored data file, using generic placeholder company names, roles, and notes — no real names, no real companies, no commentary tied to a real event. These example files are the only version of that data that should ever be tracked in git.

7. Add a short section to the README explaining the pattern: which files are gitignored and why, and that `.example.*` files show the intended shape for anyone looking at the repo.

8. Produce a summary report covering: every file gitignored and why, every `.example.*` file created or updated, any historical commits flagged in step 4, and any code changes made for graceful degradation.

## Acceptance criteria

- `git ls-files` shows no file containing a real name, a real company-specific rejection note, or a credential.
- Deleting all gitignored data files locally and running the existing scripts does not error.
- README documents the pattern.
- Nothing was deleted, no visibility was changed, no git history was rewritten, without explicit go-ahead.

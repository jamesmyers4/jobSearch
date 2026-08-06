# Session 1: Digest email fire-tag parity

## Context

`buildAlertEmailHtml` renders a 🔥 tag on any job scoring >= `FIRE_SCORE_THRESHOLD` (check-jobs.ts:1389). `buildDigestEmailHtml` does the same sort-by-score (check-jobs.ts:1335) but never computes or renders the tag — digest emails silently drop this signal. This is a one-line-shaped parity fix, no design decision involved.

## Scope

Touch only `buildDigestEmailHtml` and its test file. Do not touch `scoreJob`, `SOURCE_WEIGHT`, `STRONG_TITLE_KEYWORDS`, `BOOST_KEYWORDS`, or `buildTemplateDraft` — wiring the real resume-match score into `scoreJob` and rebalancing those weights is Session 2, a separate .md, not part of this session.

## Workflow rule

Per `CONTEXT.md`: write the test first, confirm it fails against current code, then make the fix, then confirm it passes. Every test in this suite has actually been run, not just typechecked — hold to that.

## The change

File: `check-jobs.ts`, function `buildDigestEmailHtml` (currently lines 1331-1351).

Inside the `.map((job) => ...)` callback, add the same line `buildAlertEmailHtml` uses at check-jobs.ts:1389:

```
const fireTag = scoreJob(job) >= FIRE_SCORE_THRESHOLD ? "🔥 " : "";
```

Then prepend `fireTag` to the returned `<li>` template literal, in the same position `buildAlertEmailHtml` uses it (before the `[${sourceLabel(job.key)}]` segment).

## The test

File: `tests/email/digest-email.spec.ts`. Mirror the existing fire-tag test in `tests/email/alert-email.spec.ts` (the one asserting `toContainText("🔥")`) rather than inventing a new pattern.

Add a case with two jobs:

- One that clears `FIRE_SCORE_THRESHOLD` (45) — e.g. a `tn:` source (30) posted today (age <= 1, +15) = 45
- One that doesn't — e.g. an `az:` source (5) posted a week ago (+0)

Render via `buildDigestEmailHtml`, `page.setContent(html)`, assert the first `<li>` contains `🔥` and the second does not.

## Acceptance criteria

- New test written first, run once to confirm it fails against current `buildDigestEmailHtml`
- Fix applied
- New test passes
- Full suite run for real: `npm run test:all` — all existing tests still pass, no regressions
- If `CONTEXT.md` or `TESTING.md` state exact test counts, update the Playwright count (currently "5 Playwright tests")
- **Do not commit.** Stop here — I'll review the diff and commit manually, then tell you to continue.

## Out of scope (do not start)

Resume-match score wiring, `SOURCE_WEIGHT`/keyword rebalancing, score/reasoning transparency in the email — all deferred to later sessions.

# jobSearch — Testing CONTEXT.md

Framing rules for building out the test suite. Read this before writing any test.

## What this project actually is

`check-jobs.ts` is a single-file, headless, scheduled Node script — not a web app. It has:

- **No UI.** Nothing to click through. "E2E" doesn't mean browser flows here.
- **No HTTP API of its own.** It only _calls_ other people's APIs (Adzuna, USAJOBS, SOLTECH's RSS, Quarterhill's internal JSON API, etc.) and scrapes one HTML page (Statheros). There are no routes to test.
- **No database.** State is three JSON files committed back to the repo by CI: `seen-jobs.json`, `application-tracker.json`, `digest-state.json`, plus a hand-edited `company-history.json`.
- **One real visual artifact**: the generated email HTML. That's the only place a browser engine adds genuine value over string assertions.

Don't port shenny-test-showcase's five layers literally — they assume a running web app with routes, screens, and a Postgres/Prisma database. None of that exists here. The remapping below is deliberate, not a shortcut.

## The five layers, and why each one is shaped the way it is

1. **`tests/unit/`** (Vitest) — pure functions: `scoreJob`, `isRemoteJob`, `isFreshJob`, `formatSalaryRange`, `extractYearsRequired`, `extractWorkArrangement`, `dedupeBySignature`, `resolveProvider`, `sourceLabel`, `historyStatus`, `daysOld`/`daysAgoLabel`, `slugify`, the template-kit's matching engine (`buildTemplateDraft`, `buildCoverLetter`, `significantWords`, `extractUnconfirmedTerms`). This is jobSearch's real primary logic layer — the equivalent of shenny's "API contract tests, the layer that owns the bulk of logic coverage." **Status: built** — 13 files, 96 tests, all passing (see `TESTING.md`).
2. **`tests/fetchers/`** (Vitest, mocked `fetch`) — one file per source, fed a realistic fixture response, asserting correct field mapping into `JobPosting`. This is the closest thing to shenny's "API contract" layer, just aimed at outbound calls instead of inbound routes. **Status: built** — all 11 sources covered, 34 tests passing. 10 of 11 fixtures are real captured API responses; Lever's is built from Lever's documented public API shape since `LEVER_COMPANIES` is currently empty (no live board to capture from) — see the note in `tests/fetchers/lever.test.ts` and revisit with a real capture if a company is ever added there. Writing these against real data surfaced several genuine field-mapping quirks in the fetchers themselves (documented in `TESTING.md`'s "Real quirks discovered" section) rather than inventing clean fixtures that would have hidden them.
3. **`tests/state/`** (Vitest, real temp files) — `loadSeenJobs`/`saveSeenJobs`, `loadTracker`/`saveTracker`, `loadDigestState`/`saveDigestState` + `isDigestSource`, `loadCompanyHistory`. Test against real files on disk in a real temp directory, not mocked `fs` — this is exactly the class of bug that bit the project twice already (the `git-auto-commit-action` pathspec failure, caused by a file that silently never got created). Don't call this a "DB layer" — there's no database, and calling it one will mislead whoever reads it next. **Status: built** — 4 files, 15 tests passing.
4. **`tests/integration/`** — `pipeline.test.ts` composes the real filter → dedupe → score pipeline on a realistic mixed-source array (the two real bugs this project has actually shipped, `isRemoteJob`'s one-directional signal gap and the SQL false-positive gap-flag, both lived exactly at this composition boundary, not inside any single function). `main.test.ts` is the full `main()`-level integration test — all 11 network sources, Resend, and the GitHub API (for `resume-vault` reads/writes) mocked behind a single URL-routed `fetch` mock, covering a normal run (immediate alert + digest queued but not sent), a first run (baseline only, no side effects), and a later run where a previously-queued digest actually sends. **Status: built** — 2 files, 4 tests passing.
5. **`tests/email/`** (Playwright) — the one legitimate use of a browser here. `buildAlertEmailHtml`/`buildDigestEmailHtml` were extracted specifically to make this possible without mocking the Resend SDK or sending a real email. Render the real HTML string via `page.setContent()`, assert on real DOM. Don't add more Playwright usage beyond this — there's no other visual surface in this project to justify it. **Status: built and actually executed** (not just typechecked) — `npx playwright install chromium && npm run test:email` runs clean, 2 files, 5 tests passing.

**Deliberately not built yet:**

- **Resilience/fault-injection layer** (the k6 reframe — simulating a slow/failing upstream source and verifying `safely()` contains it). Deferred by explicit decision, not an oversight. Revisit if a real fetcher failure in production ever slips through ungracefully.
- **Cucumber/BDD.** Deliberately skipped — see HANDOFF.md for the reasoning. Only reconsider if a specific case comes up where a Gherkin scenario would genuinely add something a well-named Vitest `describe`/`it` block doesn't already say in plain English.

## Real gotchas discovered while scaffolding this — don't rediscover these the hard way

- **`new Resend(process.env.RESEND_API_KEY)` runs at module load and throws on a missing key** — not just stores `undefined` silently. Any test importing from `check-jobs.ts` needs `RESEND_API_KEY` set, even if the test never touches email. Handled via `vitest.config.ts`'s `test.env`. If you add other module-level side effects to `check-jobs.ts` later, check whether they need the same treatment.
- **`main()` is guarded**: `if (import.meta.url === \`file://${process.argv[1]}\`) { main(); }`. This is why importing the module for tests doesn't trigger a live run. Don't remove this guard.
- **`loadCompanyHistory()` runs at module load too** (`const COMPANY_HISTORY = loadCompanyHistory();`), reading `company-history.json` relative to `process.cwd()`. It's safe — the function has a try/catch fallback to an empty Map — but it means tests that run from the repo root will pick up the _real_ `company-history.json`. The `scoreJob` and email tests actually lean on this deliberately (testing against the real "Golden Pet Brands: rejected" entry) rather than mocking it. That's intentional, not an accident — keep doing it that way unless there's a specific reason to isolate a test from real repo state.
- **`TRACKER_PATH`/`SEEN_JOBS_PATH`/`DIGEST_STATE_PATH` are hardcoded relative paths, not injectable.** State-layer tests use `process.chdir()` into a fresh `mkdtempSync` temp directory for each test (see `tests/state/tracker.test.ts`) rather than mocking `fs`. This is deliberate — it tests the real read/write functions against a real filesystem, which is the whole point of this layer, while never touching the actual repo's state files.
- **Playwright's browser binary is now confirmed installable and runnable** (`npx playwright install chromium && npm run test:email` runs clean) — the earlier note about the scaffolding sandbox not reaching `cdn.playwright.dev` no longer applies in an environment with normal network access. All 5 email tests have actually been executed and pass, not just typechecked.
- **Test titles must genuinely match `SEARCH_TITLES`.** A test job titled something that sounds plausible but isn't a real substring match (e.g. "QA Support") will silently get filtered out by `matchesAnyTitle` and the test will fail in a confusing way. Check the actual `SEARCH_TITLES` array before picking a fixture title.
- **`numeric postedAt` values are treated as milliseconds, not seconds, by `daysOld`/`daysAgoLabel`.** RemoteOK's `job.epoch` fallback (used when `job.date` is absent) is Unix seconds, so `new Date(job.epoch)` lands near 1970. Documented as a real quirk in `tests/unit/dateLabels.test.ts` and `TESTING.md`, not fixed — know this before trusting a RemoteOK posting's computed age.
- **Several fetchers have real field-mapping mismatches against their live APIs** (TherapyNotes' `location`, Workable cross-search's `company`/`location`/`postedAt`, USAJOBS' salary interval suffix) — all discovered by testing against real captured responses instead of inventing clean fixtures, and all documented rather than silently fixed. See `TESTING.md`'s "Real quirks discovered" section for the full list before assuming any of these fields are reliable.

## Workflow rule going forward

Every change to `check-jobs.ts` gets a test written before the change is considered done — not after, not "later." If a function doesn't have a natural home in the five layers above, that's a signal to think about where it actually belongs before writing throwaway test code around it.

## Adding a new test — the pattern

1. Confirm the function/constant you need is exported (bulk-exported already as of this scaffolding — if something new gets added to `check-jobs.ts` later, export it explicitly).
2. Pick the layer by what's actually being tested, using the five definitions above — not by what feels closest to a shenny file name.
3. If it needs real state on disk, use the `process.chdir()` + `mkdtempSync` pattern from `tests/state/tracker.test.ts`. Don't mock `fs` for this project's state layer — real files are what actually broke before, so real files are what should catch it again.
4. If it needs a fixture HTTP response, check `tests/fixtures/` first — nearly every source now has real captured data (Statheros, Adzuna, Quarterhill, TherapyNotes, Workable, Greenhouse, Ashby, RemoteOK, USAJOBS, SOLTECH) rather than invented placeholders; only Lever's is built from its documented public API shape, for lack of a live configured board. Prefer extending those over fabricating new ones from scratch.
5. Run it for real before considering it done. Every test in this suite — all 149 Vitest tests and all 5 Playwright tests — was actually executed and confirmed passing. That standard doesn't lower going forward.

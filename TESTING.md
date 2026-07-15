# Testing

jobSearch is a headless, scheduled script with no UI, no HTTP API of its own, and no database — so this suite is shaped around what the project actually is, not a template borrowed wholesale from a web app. See `CONTEXT.md` for the full reasoning behind each layer's shape; this document tracks what's built versus what's still ahead.

## Status: full coverage across all five layers

Every layer listed below has real, executed, passing coverage for every source/function it's meant to cover, including a full `main()`-level integration test. All numbers in this document were confirmed by an actual `npm test` (149 Vitest tests, 30 files) and `npm run test:email` (5 Playwright tests, 2 files) run, not inferred from what should be true.

## Layers

| Layer                 | Tool                    | Location             | Status                                                                                                                                                                                                                                       |
| ---------------------- | ----------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                   | Vitest                  | `tests/unit/`         | 13 files, 96 tests passing. Covers `scoreJob`, `isRemoteJob`, `isFreshJob`, `dedupeBySignature`/`normalizeForDedupe`, `formatSalaryRange`, `extractYearsRequired`, `extractWorkArrangement`, `resolveProvider`, `sourceLabel`, `historyStatus`, `daysOld`/`daysAgoLabel`, `slugify`, and the template-kit matching engine (`significantWords`, `extractUnconfirmedTerms`, `buildCoverLetter`, `buildTemplateDraft`). |
| Fetcher contracts      | Vitest, mocked `fetch`  | `tests/fetchers/`     | 11 files, 34 tests passing — one per source (TherapyNotes, Workable cross-search, Greenhouse, Lever, Ashby, RemoteOK, Adzuna, USAJOBS, SOLTECH, Statheros, Quarterhill). All but Lever use real captured response fixtures (see `tests/fixtures/`); Lever has no live company configured in `LEVER_COMPANIES` to capture from, so its fixture is built from Lever's documented public API shape instead — flagged in that test file. |
| State persistence      | Vitest, real temp files | `tests/state/`        | 4 files, 15 tests passing. Covers `application-tracker.json` (`tracker.test.ts`), `seen-jobs.json` (`seenJobs.test.ts`), `digest-state.json` persistence + `isDigestSource` (`digestState.test.ts`), and `company-history.json` (`companyHistory.test.ts`). |
| Pipeline integration   | Vitest                  | `tests/integration/` | 2 files, 4 tests passing. `pipeline.test.ts` composes filter→dedupe→score on a mixed batch; `main.test.ts` is the full end-to-end integration test — all 11 fetch sources, the GitHub API (resume-vault reads/writes), and Resend mocked behind one URL-routed `fetch` mock, covering a normal run, a first run (baselining only), and a later run where a queued digest actually sends. |
| Email rendering        | Playwright              | `tests/email/`        | 2 files, 5 tests passing (confirmed executed with `npx playwright install chromium && npm run test:email`, not just typechecked). Covers `buildAlertEmailHtml` (fire tags, salary, template-draft link, rejected-company tag) and `buildDigestEmailHtml` (score-sorted ordering, source labels, template-draft link, rejected-company tag, singular/plural subject wording). |

Run everything: `npm test` (Vitest layers) and `npm run test:email` (Playwright), or `npm run test:all` for both. `npm run test:coverage` for a coverage report.

## Deliberately not included in this phase

- **Resilience / fault-injection testing** — simulating a slow or failing upstream source (Adzuna timing out, USAJOBS returning a 500) and confirming `safely()` actually contains the failure rather than crashing the whole run. This is jobSearch's equivalent of shenny's k6 layer, reframed — there's no server here to load-test in the traditional sense. Deferred by choice, not forgotten. Worth revisiting if a real fetcher failure ever slips through ungracefully in production.
- **Cucumber / BDD.** Considered and deliberately skipped. shenny's Cucumber layer earns its keep by mirroring an E2E suite that already exists and reusing its browser automation — a relatively cheap English-language layer on top of infrastructure that's already built. jobSearch has no equivalent browser automation to piggyback on, so a Gherkin layer here would be a parallel structure built from scratch, largely restating what well-named `describe`/`it` blocks already say in plain English, for an audience of one person who already reads TypeScript comfortably. Revisit only if a specific scenario comes up where Gherkin would add something a unit test genuinely can't.

## Real quirks discovered while building out this suite

Writing tests against real captured API responses (rather than invented fixtures) surfaced several genuine field-mapping gaps in the current fetcher code. None have been "fixed" here — the tests document the actual current behavior so a future change is a deliberate choice, not an accidental regression fix:

- **`fetchTherapyNotesJobs` never filters by title** — unlike every other fetcher, it maps every posting on the board with no `matchesAnyTitle` call (TherapyNotes is an explicitly allowlisted company). It also always returns `location: undefined`, since the real Workable widget response has no `job.location` object at all (city/state/country are top-level fields instead).
- **`fetchTitleSearchJobs` (the Workable cross-search source) has two live field-mapping mismatches**: the real API returns `job.company.title` (not `.name`) and `job.location` as a `{city, subregion, countryName}` object (not a `.location_str` string), so `company` ends up `undefined` and `location` ends up being the raw object, not a string, for every real result. `postedAt` is always `undefined` too, since the real field is `job.updated`, not `job.updatedAt`.
- **`daysOld` misinterprets a RemoteOK-style epoch-seconds `postedAt`** (`job.epoch`, used when `job.date` is absent) as milliseconds, since `new Date(n)` always treats a numeric argument as milliseconds. This lands the computed date near 1970 instead of the real posting date, producing an enormous day count instead of the real one.
- **USAJOBS's real salary interval** (`RateIntervalCode`, e.g. `"PA"`) doesn't match `formatSalaryRange`'s `"Per X"` → `"/X"` conversion pattern the way Adzuna's `"Per Year"` string does, so USAJOBS salary ranges render with the raw abbreviation suffix (e.g. `"$143,913–$197,200 PA"`) instead of a cleaned-up one.
- **`extractUnconfirmedTerms` leaks the literal heading word "unconfirmed"** into its returned term set, since `significantWords` doesn't strip markdown heading syntax — the heading text itself gets tokenized alongside the actual skill terms underneath it.

## A note on coverage as a number

"Complete coverage" here means every meaningful behavior has a test that would fail if the behavior broke — not a 100% line-coverage target for its own sake. `npm run test:coverage` is there to spot obviously untested code, not to be chased as a score.

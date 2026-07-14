# Testing

jobSearch is a headless, scheduled script with no UI, no HTTP API of its own, and no database — so this suite is shaped around what the project actually is, not a template borrowed wholesale from a web app. See `CONTEXT.md` for the full reasoning behind each layer's shape; this document tracks what's built versus what's still ahead.

## Status: scaffolding complete, full coverage in progress

This is a starting skeleton with one real, passing example test per layer — not yet the complete suite. Going forward, every change to `check-jobs.ts` gets a test written as part of that change, not after.

## Layers

| Layer                | Tool                    | Location             | Status                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit                 | Vitest                  | `tests/unit/`        | 1 file (`scoreJob`), 4 tests passing. ~15 more pure functions still need coverage.                                                                                                                                                                                 |
| Fetcher contracts    | Vitest, mocked `fetch`  | `tests/fetchers/`    | 1 file (Statheros), 3 tests passing. 10 more sources still need coverage.                                                                                                                                                                                          |
| State persistence    | Vitest, real temp files | `tests/state/`       | 1 file (tracker), 3 tests passing. `seen-jobs`, `digest-state`, `company-history` still need coverage.                                                                                                                                                             |
| Pipeline integration | Vitest                  | `tests/integration/` | 1 test composing filter→dedupe→score on a mixed batch, passing. Full `main()`-level integration (mocking all 11 sources + Resend + GitHub API) not yet attempted — see Roadmap.                                                                                    |
| Email rendering      | Playwright              | `tests/email/`       | 1 spec file, 2 tests, typechecked and data-verified but **not yet executed** — the sandbox that built this couldn't reach `cdn.playwright.dev` to install the browser binary. Run `npx playwright install chromium && npm run test:email` as the first real check. |

Run everything: `npm test` (Vitest layers) and `npm run test:email` (Playwright), or `npm run test:all` for both. `npm run test:coverage` for a coverage report.

## Deliberately not included in this phase

- **Resilience / fault-injection testing** — simulating a slow or failing upstream source (Adzuna timing out, USAJOBS returning a 500) and confirming `safely()` actually contains the failure rather than crashing the whole run. This is jobSearch's equivalent of shenny's k6 layer, reframed — there's no server here to load-test in the traditional sense. Deferred by choice, not forgotten. Worth revisiting if a real fetcher failure ever slips through ungracefully in production.
- **Cucumber / BDD.** Considered and deliberately skipped. shenny's Cucumber layer earns its keep by mirroring an E2E suite that already exists and reusing its browser automation — a relatively cheap English-language layer on top of infrastructure that's already built. jobSearch has no equivalent browser automation to piggyback on, so a Gherkin layer here would be a parallel structure built from scratch, largely restating what well-named `describe`/`it` blocks already say in plain English, for an audience of one person who already reads TypeScript comfortably. Revisit only if a specific scenario comes up where Gherkin would add something a unit test genuinely can't.

## Roadmap — what "complete coverage" still requires

**Unit layer** — the remaining pure functions: `isRemoteJob`, `isFreshJob`, `formatSalaryRange`, `extractYearsRequired`, `extractWorkArrangement`, `dedupeBySignature`, `normalizeForDedupe`, `resolveProvider`, `sourceLabel`, `historyStatus`, `daysAgoLabel`, `daysOld`, `slugify`, and the template-kit matching engine (`significantWords`, `extractUnconfirmedTerms`, `buildTemplateDraft`, `buildCoverLetter`). The template-kit matching engine in particular deserves real depth here — it's the most novel logic in the project (IDF-weighted keyword matching across a real 7-resume corpus) and was only validated manually during development, the same way `scoreJob` was before this suite existed.

**Fetcher layer** — the remaining 10 sources: TherapyNotes, Workable cross-search, Greenhouse, Lever, Ashby, RemoteOK, Adzuna, USAJOBS, SOLTECH, Quarterhill. Fixtures for Adzuna and Quarterhill already exist in `tests/fixtures/` using real captured data — Adzuna from the actual field mapping, Quarterhill from the real treeLine recon. Building out these two fetcher test files should be the fastest next wins.

**State layer** — `seen-jobs.json` (dedup-by-key semantics), `digest-state.json` (the queue/send timing logic — this has real edge cases worth locking down: the "first digest job ever seen starts the clock without sending immediately" behavior, the interval check itself), `company-history.json` (substring matching, the `historyStatus` lookup).

**Pipeline integration** — a true `main()`-level test with all 11 sources, Resend, and the GitHub API (`resume-vault` reads/writes) mocked. Bigger lift than anything else in this list; probably the last thing to build, once the layers below it are solid enough that a full-pipeline test is mostly confirming wiring rather than catching logic bugs.

**Email layer** — once Playwright is confirmed actually running (see Status table), extend coverage to the digest email (`buildDigestEmailHtml`) and to a few more real scenarios: multiple jobs sorted by score, a job with no salary/years data, the "no strong signal found" template-kit fallback message.

## A note on coverage as a number

"Complete coverage" here means every meaningful behavior has a test that would fail if the behavior broke — not a 100% line-coverage target for its own sake. `npm run test:coverage` is there to spot obviously untested code, not to be chased as a score.

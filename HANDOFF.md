# Handoff

## Where things stand right now

The test suite scaffolding is built and verified: Vitest + Playwright installed, `check-jobs.ts` refactored to be safely importable (main() guarded, everything exported, email HTML-building separated from sending), five test layers structured with one real, passing example each, and real fixture data captured from actual sources rather than invented. See `TESTING.md` for the full layer-by-layer status and `CONTEXT.md` for the reasoning and gotchas behind each decision. 11 of the 12 example tests were actually executed and confirmed passing during scaffolding; the one Playwright spec typechecks and its data was verified correct via a standalone script, but couldn't be executed in the sandbox that built it (no network access to `cdn.playwright.dev`) — running it for real is the first thing to do next.

## Immediate next steps, in order

1. **Run `npx playwright install chromium && npm run test:email`** to confirm the one untested file actually works. Everything else in the scaffolding has already been proven to run.
2. **Work through `TESTING.md`'s Roadmap section**, layer by layer. Suggested order: fetcher tests for Adzuna and Quarterhill first (fixtures already exist, fastest wins), then the rest of the unit layer, then the remaining fetchers, then state layer, then the full `main()`-level integration test last (biggest lift, most value once everything under it is solid).
3. **From here forward: every change to `check-jobs.ts` gets a test written as part of the change, not after.** This is a hard rule going forward, not a suggestion — see `CONTEXT.md`'s Workflow section.

## Open items and things worth a real discussion — full list, not just testing

These have come up across the whole engagement and are worth deciding on, not just letting sit:

**jobSearch, smaller/quick:**

- Email subject line still doesn't reflect the fire/score system — just says "3 new job postings found," no high-match count surfaced. Small, easy, never actually done.
- Quarterhill only pulls page 1 of its API (10 jobs) — unclear if pagination exists beyond that. Same class of known limitation as Workable's documented "first page only" behavior. Worth checking once there's a slow afternoon.

**jobSearch, bigger/deferred by choice:**

- Resilience/fault-injection test layer (the k6 reframe) — deferred this round. Revisit if a real fetcher failure ever causes a problem in production that a test like this would have caught.
- SMS/push notifications — needs an actual provider decision (Twilio-type), not just code. Been on the list a while, never blocking, never picked up.
- A true `main()`-level integration test (all 11 sources + Resend + GitHub API mocked at once) — real, valuable, but big. Planned as the last item in the test roadmap for a reason.
- Statheros is the most fragile source in the pipeline — HTML-structure-dependent rather than API/RSS-backed. Not broken, just worth knowing where to look first if it ever silently starts returning zero jobs.

**Cucumber/BDD** — considered seriously, declined with real reasoning (see `TESTING.md`), not a "maybe later," genuinely not planned unless a specific case emerges where it'd add something a Vitest test can't.

**The AI cost-tier plan, longer-term:** the draft tier is still deliberately on Anthropic (not Groq) while the prefilter runs free — matches the original plan to keep Claude reserved for a premium pass. The stated future direction, in your own words: once the template-kit is mature and calibrated, feed its mechanically-matched output _into_ a Sonnet agent as a final polish pass, rather than having Sonnet draft from scratch the way it does today. Not started, but worth remembering the template-kit's output format should stay clean enough to serve as real input later, not just a scratchpad — this was already a design consideration when it was built.

**treeLine, adjacent but connected:**

- You mentioned wanting to run this same test-suite-building process on treeLine next, using this jobSearch effort as the template for how to approach it. When that happens, the same core lesson applies: treeLine actually has a UI-adjacent surface (CLI output, generated reports) and does hit a real crawl target, so its layer mapping will look different from jobSearch's — worth re-deriving from what treeLine actually is, the same way this document did for jobSearch, rather than copying this file's structure wholesale.
- Separately: the treeLine improvement this project's Quarterhill work surfaced (scoped response-body capture for `xhr`/`fetch` requests with a JSON content-type, so future API-discovery work doesn't require manually pasting a captured response back) — you mentioned sharing this with the other agent working on treeLine and that they'd added to it. Worth checking in on that when you're back in treeLine's repo, since it directly affects how smoothly the next site-recon effort goes.

## What "done" looks like for this phase

Not zero open items — some of the above are genuinely fine to leave open indefinitely (SMS/push, the Sonnet-polish-pass idea) since they're future-facing by design, not overdue. "Done" for _this_ phase specifically means: every layer in `TESTING.md`'s table has real coverage for every source/function it's meant to cover, the full `main()` integration test exists and passes, and the test-first rule has been genuinely followed for every `check-jobs.ts` change since this document was written — not retrofitted at the end.

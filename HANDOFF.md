# Handoff

## Where things stand right now

The test suite has full coverage across all five layers, including a full `main()`-level integration test, a dedicated `AI_PIPELINE_ENABLED=true` integration test, and a genuine fault-injection test proving `safely()`/`safelyValue()`/`safelyRun()` contain a real rejected fetch. `check-jobs.ts` is safely importable (main() guarded, everything exported, email HTML-building separated from sending). See `TESTING.md` for the full layer-by-layer status (198 Vitest tests / 35 files, 5 Playwright tests / 2 files, 99.07% statement / 89.03% branch / 100% function coverage on `check-jobs.ts`) and `CONTEXT.md` for the reasoning and gotchas behind each decision.

This round (2026-07-15) fixed all four real-data bugs `LASTRUN.md` had flagged but deliberately left unfixed (TherapyNotes title filter + location, Workable company/location/postedAt, RemoteOK epoch/ms, USAJOBS salary suffix), plus a fifth found during the same pass (`extractUnconfirmedTerms` leaking "unconfirmed"), removed the dead `stripHtml` export, closed the Greenhouse `content` gap with a real live capture, and closed both coverage gaps `TESTING.md` had flagged (`AI_PIPELINE_ENABLED=true`, the resilience/fault-injection layer). The test-first rule was followed for every fix — see `TESTING.md`'s "Real quirks discovered" section for what each one actually does.

## Immediate next steps, in order

1. **From here forward: every change to `check-jobs.ts` gets a test written as part of the change, not after.** This is a hard rule going forward, not a suggestion — see `CONTEXT.md`'s Workflow section.
2. Nothing else is currently queued as a "next step" for the test suite itself — see "Open items" below for what's genuinely still open, none of which is testing-scaffolding work.

## Open items and things worth a real discussion — full list, not just testing

These have come up across the whole engagement and are worth deciding on, not just letting sit:

**jobSearch, smaller/quick:**

- Email subject line still doesn't reflect the fire/score system — just says "3 new job postings found," no high-match count surfaced. Small, easy, never actually done.
- Quarterhill only pulls page 1 of its API (10 jobs) — unclear if pagination exists beyond that. Same class of known limitation as Workable's documented "first page only" behavior. Worth checking once there's a slow afternoon.

**jobSearch, bigger/deferred by choice:**

- SMS/push notifications — needs an actual provider decision (Twilio-type), not just code. Been on the list a while, never blocking, never picked up.
- Statheros is the most fragile source in the pipeline — HTML-structure-dependent rather than API/RSS-backed. Not broken, just worth knowing where to look first if it ever silently starts returning zero jobs.

**Cucumber/BDD** — considered seriously, declined with real reasoning (see `TESTING.md`), not a "maybe later," genuinely not planned unless a specific case emerges where it'd add something a Vitest test can't.

**The AI cost-tier plan, longer-term:** the draft tier is still deliberately on Anthropic (not Groq) while the prefilter runs free — matches the original plan to keep Claude reserved for a premium pass. The stated future direction, in your own words: once the template-kit is mature and calibrated, feed its mechanically-matched output _into_ a Sonnet agent as a final polish pass, rather than having Sonnet draft from scratch the way it does today. Not started, but worth remembering the template-kit's output format should stay clean enough to serve as real input later, not just a scratchpad — this was already a design consideration when it was built.

**treeLine, adjacent but connected:**

- You mentioned wanting to run this same test-suite-building process on treeLine next, using this jobSearch effort as the template for how to approach it. When that happens, the same core lesson applies: treeLine actually has a UI-adjacent surface (CLI output, generated reports) and does hit a real crawl target, so its layer mapping will look different from jobSearch's — worth re-deriving from what treeLine actually is, the same way this document did for jobSearch, rather than copying this file's structure wholesale.
- Separately: the treeLine improvement this project's Quarterhill work surfaced (scoped response-body capture for `xhr`/`fetch` requests with a JSON content-type, so future API-discovery work doesn't require manually pasting a captured response back) — you mentioned sharing this with the other agent working on treeLine and that they'd added to it. Worth checking in on that when you're back in treeLine's repo, since it directly affects how smoothly the next site-recon effort goes.

## What "done" looks like for this phase

Not zero open items — some of the above are genuinely fine to leave open indefinitely (SMS/push, the Sonnet-polish-pass idea) since they're future-facing by design, not overdue. "Done" for _this_ phase specifically means: every layer in `TESTING.md`'s table has real coverage for every source/function it's meant to cover, the full `main()` integration test exists and passes, and the test-first rule has been genuinely followed for every `check-jobs.ts` change since this document was written — not retrofitted at the end.

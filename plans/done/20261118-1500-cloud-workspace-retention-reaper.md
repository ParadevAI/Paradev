# Cloud sandbox cleanup job

Reference: AGENTS.md. Spec: the page "Cloud sandbox lifecycle: the end state"; model: `.agents/skills/verify-sandbox-lifecycle` (#10006).

## Purpose

We, not Vercel, decide when a box, snapshot, drive or golden is deleted, and the database knows what is gone. One job (`reap-retention`, every 6 hours, production only) applies three rules from one table in `packages/trpc/src/router/cloud-workspace/retention.ts`; rule 1's wait table is `wait.ts`.

## Decisions

- Rules: (1) a workspace past its wait (asleep 30 d, archived 7 d, failed 30 d, stuck creating 1 d) is retired by one conditional write, then torn down; (2) an archived environment's goldens, and a live one's beyond its newest 3 (`goldensToDelete`, as #10000); (3) what no production row names after 7 days, and agents drives not current and not mounted.
- Mechanics: only production deletes (`sandboxDeletesAllowed`, shared with #9847); archive, a failed create and a 410 only set a status; an unarchive after 7 days is refused; the job deletes nothing on an incomplete listing (#9943's checks); new boxes get `snapshotExpiration: 0`.
- Stricter than the model, all keeps: an asleep row whose box runs; a drive a box mounts; an agents drive under a day old; an incomplete listing.
- The backfill of existing boxes is on the branch `superset/backfill-snapshot-expiration-spike`, run once by hand.

## Validation

`bun test` in packages/trpc; `.agents/skills/verify-sandbox-lifecycle/run.sh` (20 of 20 expected); `scripts/cleanup-dry-run.ts` against production with the readonly role (2026-11-19: rule 1 one row, rule 2 none, rule 3 61 boxes and 28 agents drives).

## Outcomes

Done on draft #9987. Open: #9847's drive columns must join rule 3's names; #10000's builds table feeds rule 2 for live environments.

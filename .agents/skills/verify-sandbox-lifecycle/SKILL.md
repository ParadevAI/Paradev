---
name: verify-sandbox-lifecycle
description: Model-check the end-state lifecycle rules for every cloud sandbox resource with TLA+ (workspace boxes and snapshots, workspace drives, environment goldens, agents drives) across the PROD and PREVIEW databases on one Vercel project. Run when changing a rule of what is deleted and when, the cleanup job, teardown, the build's golden rotation, or the production-only delete check.
---

# Verify the sandbox resource lifecycle rules

`Lifecycle.tla` states the end-state rules, not today's code. It is the precise form of the page
"Cloud sandbox lifecycle: the end state"
(https://app.superset.sh/page/20261119-sandbox-lifecycle-end-state-m2ycgd); the two must agree.
The code models (`verify-sandbox-drive`, `verify-sandbox-asleep`) check the code.

```bash
.agents/skills/verify-sandbox-lifecycle/run.sh                 # every config: config | expected | actual
.agents/skills/verify-sandbox-lifecycle/run.sh Lifecycle.cfg   # one config, full TLC output
```

`run.sh` needs Java 17 or later and downloads `tla2tools.jar` once into `~/.cache/tla`. It exits
non-zero if any config gives a result other than the expected one.

## The world

- One Vercel project. Two databases: `PROD` (production and staging) and `PREVIEW`, a copy of
  PROD taken at any time by `Branch`, which then drifts. Queued jobs are not copied.
- Resources: a workspace box with its snapshot (one resource), a workspace drive, an environment
  golden, an agents drive. Releases come from main only; a boot or wake mounts the current
  release's agents drive.
- Time is abstract days. A day ticks each row's `t` (days in its status; an awake row does not
  age) and each box, drive and golden's age (days since created).

## The rules

| Rule | Applied by | Actions |
| --- | --- | --- |
| 1 Workspaces: a workspace not in use is deleted (box, snapshot, drive) after its wait: asleep 30 days after last use, archived 7 days (an unarchive before the retire keeps everything), failed 30 days, stuck creating 1 day | cleanup job | `Retire`, `TdRun` |
| 2 Goldens: each live environment keeps its 3 newest; OVERLAY: never one a workspace is pinned to | the build or promote; with OVERLAY, the cleanup job for live environments | `Build`, `BuildPrune`, `EnvGoldenDelete` |
| 3 Leftovers: anything nothing in production refers to, older than 7 days, an archived environment's goldens included (only a live environment names its goldens); an agents drive that is not the current release's, nor the previous release's within 48 hours of the current one, nor younger than 48 hours (a running box's is refused by Vercel) | cleanup job | `Leftover`, `AgentsCleanup` |

Mechanics:

- **Only production deletes.** `DelBy(S, d)` is the one check inside the delete functions: with
  PREVIEW it changes nothing ("would delete"). The cleanup job runs only in production.
- **Everything else only sets a status.** `Archive`, `Fail` (a failed create, a 410 on wake) and
  `Unarchive` write the row and delete nothing. A stop replaces the box's previous snapshot.
- **One teardown.** `Retire` is one conditional write: the wait is over, the row's names are
  cleared and the job is queued. `TdRun` then deletes box and drive together and stays queued
  until it has run.
- **No Vercel expiry.** `VercelExpire` exists only for the config that shows why.

## The properties

- **NoDeleteWhileUsed** (action property): nothing production uses is deleted: a box or drive a
  PROD row names, PROD's active golden, a golden a PROD workspace is pinned to (OVERLAY), the
  current release's agents drive, an agents drive a box mounts.
- **Retention** (action property): a row is retired only after its wait, and a box or drive is
  deleted only by its teardown, as a leftover past 7 days, or for a row past its wait.
- **Isolation** (invariant): PREVIEW never deletes anything.
- **NoLeak** (liveness, weak fairness of every cleanup step, of the build's prune and of time):
  what no rule keeps is eventually deleted. A row past its wait keeps nothing; production's live
  environment keeps its newest `KeepGoldens`.

## Configs

| Config | What | Expected |
| --- | --- | --- |
| `Lifecycle.cfg` | PROD, 2 workspaces, a release, a deleted organization | pass |
| `Lifecycle-golden.cfg` | PROD, 2 workspaces, a build, an environment archive, a deleted organization | pass |
| `Lifecycle-preview.cfg` | PREVIEW copied from PROD at any time, a workspace in each | pass |
| `Lifecycle-overlay.cfg` | OVERLAY with the pin check, safety | pass |
| `Lifecycle-overlay-leak.cfg` | OVERLAY with the pin check, NoLeak | fails NoLeak: a gap in rule 2 |
| `Lifecycle-overlay-cleanup-prunes.cfg` | OVERLAY, and the cleanup job also prunes live environments | pass |
| `Lifecycle-td-giveup-rule3.cfg` | a teardown may give up; rule 3 deletes what it left | pass |
| `Lifecycle-safety-all.cfg` | a preview, builds, environment archives and deleted organizations at once, safety | pass |
| `Lifecycle-a-delete-from-preview*.cfg` | (a) DELETE_FROM_PREVIEW | fails NoDeleteWhileUsed; fails Isolation |
| `Lifecycle-b-overlay-nopin.cfg` | (b) OVERLAY without the pin check | fails NoDeleteWhileUsed |
| `Lifecycle-c-drive-first.cfg` | (c) teardown deletes the drive before it retires the row | fails NoDeleteWhileUsed |
| `Lifecycle-d-no-rule3.cfg` | (d) no rule 3 | fails NoLeak |
| `Lifecycle-e-fail-tears-down.cfg` | (e) a failure tears down at once | fails Retention |
| `Lifecycle-rule3-boxes-only.cfg` | rule 3 read as boxes only | fails NoLeak |
| `Lifecycle-no-rule1.cfg`, `-no-rule2`, `-no-grace`, `-vercel-expiry`, `-td-giveup` | one rule or mechanic off | fails NoLeak, NoLeak, Retention, NoDeleteWhileUsed, NoLeak |

## Bounds

The waits are scaled and keep their order: stuck creating `ProvStuck = 1` (1 day) < archived
`Grace = 2` and leftovers `LeftoverAge = 2` (7 days) < asleep `Expire = 3` and failed
`FailKeep = 3` (30 days). `KeepGoldens = 1` stands for 3, with 2 goldens per database. 2 releases.
One environment and one organization per database. The liveness scenarios are split
so each finishes in about a minute; builds in both databases at once are checked for safety only.

## Readings chosen where the rules are open

1. **Rule 3 covers drives and goldens.** The page says "anything ... nothing in production refers
   to", then gives "a box no row names". Read as boxes only, a deleted organization's drives and
   goldens and a preview's drives and goldens stay for ever (`Lifecycle-rule3-boxes-only.cfg`).
2. **Rule 2 under OVERLAY has a gap.** A golden pinned when the last build pruned is skipped. When
   its workspace goes, nothing deletes it: the environment still lists it, so it is no leftover,
   and only the next build prunes. The fix checked here: the cleanup job also prunes goldens
   beyond the newest 3 of live environments.
3. **A preview's own boxes die at 7 days**, counted from creation and even while its row uses
   them: no production row names them. NoDeleteWhileUsed is about production only.
4. **A preview's copied rows name production's boxes.** No property depends on it, because
   PREVIEW deletes nothing; a preview can still wake a production box (out of scope on the page).
5. **Unarchive is not refused after the 7 days.** The retire is one conditional write that needs the
   row still archived, so an unarchive that lands before it keeps everything; one after it gets a new box.
6. **A wake at day 30 against the retire:** the retire is one conditional write (still asleep,
   still past the wait). A wake before it wins.
7. **A stopped box's mount keeps nothing.** A wake mounts the current release's agents drive, so
   only a running box holds an old one, and Vercel refuses to delete a drive a running box holds.
   One constant, `AgentsKeep` (48 hours), keeps the previous release's drive after a release and
   any agents drive younger than it.
8. **"Retried until done" is backed up by rule 3:** a teardown that gives up leaves a box and drive
   no row names, and rule 3 deletes them after 7 days.

## What is left out

More than one environment or organization per database, staging's deployment as a second
cleanup job on PROD, the promote's source workspace, rollback to an older golden, temporary boxes
a job makes, registry images, and a box created before its row is written.

# Cloud usage events backfill

How to fill `cloud_usage_events` for the locks metered before the meter wrote rows (M5a), and
`created_by_user_id` on the boots made before `authorizeBoot` wrote it. The coordinating agent runs
it, after the owner has approved the plan and the dry-run counts. A PR agent never runs it against
production.

Three scripts in `packages/trpc/scripts/`. All take the Autumn events from one export file, so every
step reads the same events.

| Script | Writes |
|---|---|
| `export-autumn-usage-events.ts --out FILE` | The file only. Reads live Autumn's SQL endpoint through the Autumn plugin of the `superset` CLI, because the live Autumn key exists only in the deploy secrets. |
| `backfill-cloud-usage-events.ts --events FILE [--apply]` | Nothing without `--apply`. With it: inserts into `cloud_usage_events`, and sets `cloud_workspace_boots.created_by_user_id` where it is null. |
| `check-cloud-usage-events.ts --events FILE` | Nothing. Exits 1 when our rows and Autumn differ. |

Each script prints the database host it uses. `packages/db` loads the root `.env`, which has more
than one `DATABASE_URL`, so always set `DATABASE_URL` on the command line, and read the host in the
output before you go on. None of the root `.env` URLs is production. Production is the default branch
of the Neon project `Superset`; its host starts with `ep-icy-feather`. Get its URL from Neon
(`get_connection_string`): for steps 3 and 5 use the `readonly` role, which cannot write; only step 4
needs the owner role.

## What it writes

The meter writes one row for each amount it sends: one window of one lock. History cannot be split
that way. Autumn's events do not say which is a reservation, an adjustment, a track or a refund, so
the windows of a lock with several sends are not known. The backfill writes **one row per lock**,
Autumn's net: the sum of the lock's events per boot id, lock sequence and feature. Its `sent_at` and
`window_to` are the lock's last event; `window_from` is `window_to` less the amount at the boot's GB.
A CPU row has the boot's start and stop. A lock therefore lands on the day of its last event: a lock
reserved before midnight and confirmed after it moves to the next day. Per organization the rows and
Autumn agree; per day they differ by those locks. Rules for the launch-night events are in `packages/db/src/cloud-usage-autumn.ts`.

It fills **every settled lock that has no row**, whenever it runs. That covers the history and also
repairs a lock whose row write failed after the deploy (the meter reports those to Sentry). It needs
no cutoff: a lock is settled when its boot has moved past it or closed, and its last event is 80
minutes (`LOCK_SETTLED_MS`: the 70 minute lock lifetime, when Autumn refunds a held lock, and a
margin) older than the end of the export. By then the meter has written any row it will write.
It only inserts, and only for a lock with no row, so a second run writes nothing.

It does not write:

- **Locks with a row.** The meter wrote them, or an earlier run did.
- **Open locks and locks not settled yet.** The meter writes them when it settles.
- **Locks the boot row never recorded**: a lock sequence above the boot's `lock_seq`. The meter
  took the lock but its boot row never moved to it, and Autumn refunds it days later (2.5 to 7.5 on
  2026-11-04), so a row written before the refund could never be corrected. They are listed under
  `unrecordedLocks`. On 2026-11-18 there were 5, all refunded and netting to 0.
- **Locks that net to zero**: releases.
- **Locks that net below zero**: on launch night, 109 confirm adjustments were keyed to a boot but
  their reservations were not. Each reservation has several candidates (same customer, value and
  hour), so they are not paired. They are listed under `anomalies`, and their reservations are
  among the `untied` events.
- **Events with no boot row**: the 191 launch-night events with no `bootId` (3,361.52 GB-minutes
  net), and events of boots made after the database was read. Totals are in `untied`, per
  organization, day and feature.

## Steps

1. **Export Autumn's events.** The Autumn plugin must be connected to live Autumn. This must print
   `"env":"live"`:

   ```bash
   superset mcp call-tool getCurrentOrganization '{}' --plugin autumn --json
   ```

   Take the export for step 4 at least 80 minutes after the M5a deploy finished. A lock settled in
   the 80 minutes before the deploy has no row, and the meter never writes one. An earlier export
   counts it as `notSettled`, and the apply skips it until a run with a later export (375 locks,
   66,048 GB-minutes and 3,588 CPU-minutes in an export taken at the deploy on 2026-11-18). About 77
   Autumn calls and 2 minutes for 114k events:

   ```bash
   bun run packages/trpc/scripts/export-autumn-usage-events.ts --out /tmp/autumn-usage-events.jsonl
   ```

2. **Rehearse on a Neon branch of production.** Make a new branch from production (the Neon
   `create_branch` tool). After the M5a deploy it already has migration 0197. Then:

   ```bash
   B=postgresql://...branch...
   F=/tmp/autumn-usage-events.jsonl
   DATABASE_URL=$B bun run packages/trpc/scripts/backfill-cloud-usage-events.ts --events $F
   DATABASE_URL=$B bun run packages/trpc/scripts/backfill-cloud-usage-events.ts --events $F --apply
   DATABASE_URL=$B bun run packages/trpc/scripts/backfill-cloud-usage-events.ts --events $F --apply
   DATABASE_URL=$B bun run packages/trpc/scripts/check-cloud-usage-events.ts --events $F
   ```

   The second `--apply` prints `{"written":0,"createdByUserIdFilled":0}`. The check prints `fail`
   with only `onlyAutumn`, equal to the dry run's `skipped.negative`. Delete the branch when you are
   done.

3. **Dry run against production** (it only reads). Show the owner `rows`, `skipped`,
   `rowsByOrganization`, `rowsByDay`, `untied`, `anomalies` and `createdByUserId`. Get a yes.

4. **Apply on production** with the same file and `--apply`. Write down the time first
   (`date -u +%FT%TZ`); the undo needs it.

5. **Check production** with the check script, and read a failure with the list below.

The backfill is safe to run again later with a new export, for example to repair rows after a
failed write.

## Expected differences in the check

A `fail` result is expected. Before the apply, `onlyAutumn` holds nearly every settled lock (62,823
on 2026-11-18). After it, these differences are known; anything else is a finding to report.

| Where | What | Why |
|---|---|---|
| `onlyAutumn` | The 109 launch-night locks that net below zero (the dry run's `skipped.negative`) | The reservation was sent with no boot, so the backfill writes no row. |
| `onlyAutumn` | A lock in `unrecordedLocks` whose refund has not landed yet | Autumn still holds its reservation; it nets to 0 once refunded and then drops out. |
| `amountDiffers`, ours a little higher | A lock whose confirm Autumn applied but answered 503, after the deploy | Our row holds the retry's window; Autumn kept the first confirm's amount. The difference is the seconds between the two tries (the 409 gap, closed by M5c). |
| `amountDiffers`, ours lower | A lock with several windows where one window's row write failed | The backfill skips a lock that has any row. Sentry has the write error. |

`onlyOurs` and `unsentOlderThanAnHour` should be 0 until M5c changes the order of the meter.

## Known amounts in the rows

The backfill copies what Autumn charged, so these rows hold Autumn's amount, not the intended one.
They are in the `anomalies` list, and they are not differences in the check:

- The 4 locks confirmed and then also tracked in full (`c3f74f0c` seq 0, `a4a954d5` seq 5,
  `76b305a3` seq 2, `b9a3efb4` seq 6): a confirm answered 503 but applied, the retry found no lock,
  and the meter tracked the window again. M5a fixes the cause; a refund is a separate decision.
- Locks with 3 or more events: tracks after an `insufficient_balance` confirm and the lock's later
  refund, and boots whose renewal failed so several windows were tracked under one lock (up to 108
  events, boot `e9656cb0` seq 12).

## Undo

The backfilled rows are those created by the run, at or after the time it started:

```sql
delete from cloud_usage_events where created_at >= '<start of the apply run>' and sent_at < '<start of the apply run>';
```

The creator fill is not undone: it only sets a value where there was none, from the workspace
creator or, for 166 boots whose workspace is gone, the user Autumn was sent.

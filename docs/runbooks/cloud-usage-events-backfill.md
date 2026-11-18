# Cloud usage events backfill

How to fill `cloud_usage_events` for the boots metered before the meter wrote rows (M5a), and
`created_by_user_id` on the boots made before `authorizeBoot` wrote it. The coordinating agent runs
it, after the owner has approved the plan and the dry-run counts. A PR agent never runs it against
production.

Three scripts in `packages/trpc/scripts/`. All take the Autumn events from one export file, so every
step reads the same events.

| Script | Writes |
|---|---|
| `export-autumn-usage-events.ts --out FILE` | The file only. Reads live Autumn's SQL endpoint through the Autumn plugin of the `superset` CLI, because the live Autumn key exists only in the deploy secrets. |
| `backfill-cloud-usage-events.ts --events FILE --before ISO [--apply]` | Nothing without `--apply`. With it: `cloud_usage_events`, and `cloud_workspace_boots.created_by_user_id` where it is null. |
| `check-cloud-usage-events.ts --events FILE` | Nothing. Exits 1 when a row and Autumn differ. |

Each script prints the database host it uses. `packages/db` loads the root `.env`, which has more
than one `DATABASE_URL`, so always set `DATABASE_URL` on the command line, and read the host in the
output before you go on.

## What a row is

One row is Autumn's net for one lock: the sum of its events per boot id, lock sequence and feature.
`sent_at` and `window_to` are the time of the lock's last event; `window_from` is `window_to` less the
amount at the boot's GB. A CPU row has the boot's start and stop as its window and the boot's last
lock sequence. Rules for the launch-night events are in `packages/db/src/cloud-usage-autumn.ts`.

The script does not write:

- **Open locks**: the boot is still open and the lock is its current one. The meter writes the row
  when it settles.
- **Locks with an event at or after `--before`**. The meter wrote those.
- **Locks that net to zero**: releases, and refunds of locks the boot row never recorded.
- **Locks that net below zero**: on launch night, 109 confirm adjustments were keyed to a boot but
  their reservations were not. Each reservation has several candidates (same customer, value and
  hour), so they are not paired. They are listed under `anomalies`, and their reservations are
  among the `untied` events.
- **Events with no boot row**: the 191 launch-night events with no `bootId` (3,361.52 GB-minutes
  net), and events of boots made after the branch or database was read. Totals are in `untied`, per
  organization, day and feature.

A row never changes once its `sent_at` is at or after `--before`, so a meter row is safe from the
backfill. Running the script again sets the same values; it never adds.

## Steps

1. **Find `--before`.** It is the first time the deployed M5a meter wrote a row. On production,
   before the first backfill only:

   ```sql
   select min(sent_at) from cloud_usage_events;
   ```

   Write the value in the run log. After a backfill this query returns a backfilled row, not the
   deploy.

2. **Export Autumn's events.** About 80 Autumn calls and 2 minutes for 114k events:

   ```bash
   bun run packages/trpc/scripts/export-autumn-usage-events.ts --out /tmp/autumn-usage-events.jsonl
   ```

3. **Rehearse on a Neon branch of production.** Make a new branch from production (the Neon
   `create_branch` tool) and apply this repo's migrations to it, then:

   ```bash
   B=postgresql://...branch...
   DATABASE_URL=$B bun run packages/trpc/scripts/backfill-cloud-usage-events.ts \
     --events /tmp/autumn-usage-events.jsonl --before "$BEFORE"
   DATABASE_URL=$B bun run packages/trpc/scripts/backfill-cloud-usage-events.ts \
     --events /tmp/autumn-usage-events.jsonl --before "$BEFORE" --apply
   DATABASE_URL=$B bun run packages/trpc/scripts/check-cloud-usage-events.ts \
     --events /tmp/autumn-usage-events.jsonl
   ```

   Run the `--apply` line a second time: `written` is the same, `createdByUserIdFilled` is 0, and
   the row count and sums do not change.

4. **Dry run against production** (it only reads). Show the owner `rows`, `skipped`,
   `rowsByOrganization`, `rowsByDay`, `untied`, `anomalies` and `createdByUserId`. Get a yes.

5. **Apply on production** with the same file and `--before`, and `--apply`.

6. **Check production** with the check script. Expected result: `fail`, with `onlyOurs`,
   `amountDiffers` and `unsentOlderThanAnHour` at 0, and `onlyAutumn` equal to the locks the dry
   run skipped as `negative` (109 on 2026-11-18). Anything else is a finding: stop and report it.

## Known amounts in the rows

The backfill copies what Autumn charged, so these rows hold Autumn's amount, not the intended one.
They are in the `anomalies` list:

- The 4 locks confirmed and then also tracked in full (`c3f74f0c` seq 0, `a4a954d5` seq 5,
  `76b305a3` seq 2, `b9a3efb4` seq 6): a confirm answered 503 but applied, the retry found no lock,
  and the meter tracked the window again. M5a fixes the cause; a refund is a separate decision.
- Locks with 3 or more events: tracks after an `insufficient_balance` confirm and the lock's later
  expiry, and boots whose renewal failed so several windows were tracked under one lock (up to 108
  events, boot `e9656cb0` seq 12).

## Undo

The backfilled rows are the ones sent before `--before`:

```sql
delete from cloud_usage_events where sent_at < '<before>';
```

The creator fill is not undone: it only sets a value where there was none, from the workspace
creator or, for 166 boots whose workspace is gone, the user Autumn was sent.

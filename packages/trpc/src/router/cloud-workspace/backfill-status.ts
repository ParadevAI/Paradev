import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { count, eq, sql } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import { listAllSandboxes } from "../../lib/sandbox";
import { recordSandboxAwake } from "./sandbox-expiry";

const ASLEEP_BATCH = 200;

export interface LegacyAwakeBackfill {
	/** Rows at `ready` when the run started. */
	ready: number;
	awake: number;
	asleep: number;
	/** Of `asleep`: rows whose box Vercel no longer lists. */
	missing: number;
	/** Left at `ready` because Vercel was starting or stopping the box; the next run takes them. */
	settling: number;
	/** Rows still at `ready` when the run ended. */
	remaining: number;
}

/**
 * Moves every row still at the old `ready` to `awake` or `asleep`, from a
 * listing of the whole team: the reconcile lists only boxes that changed in
 * its lookback, so a box that stopped long ago is never reclassified there.
 * Each write needs the row to still be at `ready`, and every live writer moves
 * a row off it, so a wake that lands after the listing wins. Safe to re-run.
 * TODO(SUPER-3018): delete with the old-spelling reads once production has no `ready` rows.
 */
export async function backfillLegacyAwakeStatus(): Promise<LegacyAwakeBackfill> {
	const rows = await db
		.select({
			id: cloudWorkspaces.id,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
		})
		.from(cloudWorkspaces)
		.where(eq(cloudWorkspaces.status, "ready"));
	const outcome: LegacyAwakeBackfill = {
		ready: rows.length,
		awake: 0,
		asleep: 0,
		missing: 0,
		settling: 0,
		remaining: 0,
	};
	if (rows.length === 0) return outcome;

	const listed = new Map(
		(await listAllSandboxes()).map((box) => [box.name, box]),
	);
	const now = Date.now();
	const stopped: { id: string; sessionId: string | null }[] = [];
	for (const row of rows) {
		const box = listed.get(row.providerSandboxId);
		if (box?.settling) {
			outcome.settling += 1;
			continue;
		}
		if (box?.expiresAt && box.expiresAt.getTime() > now) {
			await recordSandboxAwake(row.id, {
				expiresAt: box.expiresAt,
				sessionId: box.sessionId,
			});
			outcome.awake += 1;
			continue;
		}
		if (!box) outcome.missing += 1;
		stopped.push({ id: row.id, sessionId: box?.sessionId ?? null });
	}

	const organizations = new Set<string>();
	for (let start = 0; start < stopped.length; start += ASLEEP_BATCH) {
		const batch = stopped.slice(start, start + ASLEEP_BATCH);
		const values = sql.join(
			batch.map((row) => sql`(${row.id}::uuid, ${row.sessionId}::text)`),
			sql`, `,
		);
		const { rows: slept } = await db.execute<{ organization_id: string }>(sql`
			update ${cloudWorkspaces}
			set status = 'asleep',
				sandbox_expires_at = now(),
				sandbox_session_id = coalesce(listed.session_id, ${cloudWorkspaces.sandboxSessionId})
			from (values ${values}) as listed (id, session_id)
			where ${cloudWorkspaces.id} = listed.id and ${cloudWorkspaces.status} = 'ready'
			returning ${cloudWorkspaces.organizationId}
		`);
		outcome.asleep += slept.length;
		for (const { organization_id } of slept) organizations.add(organization_id);
	}
	for (const organizationId of organizations) {
		nudge(organizationId, "cloud_workspaces");
	}

	const [left] = await db
		.select({ value: count() })
		.from(cloudWorkspaces)
		.where(eq(cloudWorkspaces.status, "ready"));
	outcome.remaining = left?.value ?? 0;
	console.log("[cloud-workspace/backfill-status]", outcome);
	return outcome;
}

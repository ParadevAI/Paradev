import { db } from "@superset/db/client";
import type { CloudWorkspaceFailureReason } from "@superset/db/enums";
import { cloudWorkspaceBoots, cloudWorkspaces } from "@superset/db/schema";
import { and, asc, eq, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { logControl } from "../../lib/control-log";
import { nudge } from "../../lib/realtime";
import { settleWorkspaceNow } from "./meter";
import { nextSandboxNameFor } from "./provision";
import { ARCHIVE_GRACE_SECONDS, reapWorkspaceFiles } from "./reap";
import { recordBootEnd } from "./sandbox-sleep";
import { anyOf, teardownBox } from "./teardown";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Per rule and run. Every 6 hours, so 800 retires a day against a peak of 725 new workspaces. */
export const BATCH = 200;

const at = (cutoff: Date) => sql`${cutoff.toISOString()}::timestamptz`;
const noBootAfter = (cutoff: Date, open: boolean) =>
	sql`not exists (select 1 from ${cloudWorkspaceBoots} where ${cloudWorkspaceBoots.cloudWorkspaceId} = ${cloudWorkspaces.id} and (${cloudWorkspaceBoots.startedAt} >= ${at(cutoff)}${open ? sql` or ${cloudWorkspaceBoots.stoppedAt} is null or ${cloudWorkspaceBoots.stoppedAt} >= ${at(cutoff)}` : sql``}))`;
const notArchived = isNull(cloudWorkspaces.deletedAt);

/**
 * Rule 1's wait table: how long a workspace not in use keeps its box, and
 * what the retire write makes it. A row whose status stays (`failAs` null) is
 * selected only while its box is listed, which a retired name never is.
 */
export const WAIT = {
	asleep: {
		ms: 30 * DAY_MS,
		failAs: "snapshot_expired",
		// A wake writes its boot before Vercel resumes the box, so one in flight keeps the row.
		since: (cutoff: Date) =>
			and(
				notArchived,
				lt(cloudWorkspaces.createdAt, cutoff),
				or(
					isNull(cloudWorkspaces.sandboxExpiresAt),
					lt(cloudWorkspaces.sandboxExpiresAt, cutoff),
				),
				noBootAfter(cutoff, true),
			),
	},
	archived: {
		ms: ARCHIVE_GRACE_SECONDS * 1000,
		failAs: null,
		since: (cutoff: Date) =>
			sql`coalesce(${cloudWorkspaces.deletedAt}, ${cloudWorkspaces.updatedAt}) < ${at(cutoff)}`,
	},
	failed: {
		ms: 30 * DAY_MS,
		failAs: null,
		since: (cutoff: Date) =>
			and(
				notArchived,
				sql`coalesce(${cloudWorkspaces.failedAt}, ${cloudWorkspaces.updatedAt}) < ${at(cutoff)}`,
			),
	},
	provisioning: {
		ms: DAY_MS,
		failAs: "create_failed",
		// An unarchive moves an old row to provisioning, so `updated_at` counts too.
		since: (cutoff: Date) =>
			and(
				notArchived,
				lt(cloudWorkspaces.createdAt, cutoff),
				lt(cloudWorkspaces.updatedAt, cutoff),
				noBootAfter(cutoff, false),
			),
	},
} satisfies Record<
	string,
	{
		ms: number;
		failAs: CloudWorkspaceFailureReason | null;
		since: (cutoff: Date) => SQL | undefined;
	}
>;

export type WaitStatus = keyof typeof WAIT;
const WAIT_STATUSES = Object.keys(WAIT) as WaitStatus[];

/** Still in `status` and still past its wait: the condition of the one retire write. */
export function pastWait(status: WaitStatus, now: number): SQL {
	return and(
		eq(cloudWorkspaces.provider, "vercel"),
		eq(cloudWorkspaces.status, status),
		WAIT[status].since(new Date(now - WAIT[status].ms)),
	) as SQL;
}

/** Rule 1 as one select. */
export function waitOverWhere(now: number, listed: readonly string[]): SQL {
	const isListed = anyOf(cloudWorkspaces.providerSandboxId, listed);
	return or(
		...WAIT_STATUSES.map((status) =>
			WAIT[status].failAs
				? pastWait(status, now)
				: and(pastWait(status, now), isListed),
		),
	) as SQL;
}

export interface WaitingWorkspace {
	id: string;
	organizationId: string;
	providerSandboxId: string;
	status: WaitStatus;
}

export async function findPastWait(
	now: number,
	listed: readonly string[],
): Promise<WaitingWorkspace[]> {
	const rows = await db
		.select({
			id: cloudWorkspaces.id,
			organizationId: cloudWorkspaces.organizationId,
			providerSandboxId: cloudWorkspaces.providerSandboxId,
			status: cloudWorkspaces.status,
		})
		.from(cloudWorkspaces)
		.where(waitOverWhere(now, listed))
		.orderBy(asc(cloudWorkspaces.createdAt))
		.limit(BATCH);
	return rows.filter((row): row is WaitingWorkspace => row.status in WAIT);
}

/**
 * teardown(row): one conditional write takes the box name off the row, and
 * its status with it, while it is still in its status and past its wait;
 * then the box is deleted. A wake that lands first wins and this returns
 * false. An archived row ends its boots and settles first, and its files go
 * with the box.
 */
export async function retireWorkspace(
	row: WaitingWorkspace,
	now: number,
): Promise<boolean> {
	const scope = {
		cloudWorkspaceId: row.id,
		organizationId: row.organizationId,
	};
	if (row.status === "archived") {
		await recordBootEnd(scope, { sessionId: null, reason: "archived" });
		await settleWorkspaceNow(row.id).catch((error) =>
			console.error(`[cloud-workspace] ${row.id} final settle failed`, error),
		);
	}
	const failAs = WAIT[row.status].failAs;
	const [retired] = await db
		.update(cloudWorkspaces)
		.set({
			...(failAs && {
				status: "failed" as const,
				failureReason: failAs,
				failedAt: new Date(now),
				sandboxUrl: null,
			}),
			providerSandboxId: nextSandboxNameFor(row.id),
		})
		.where(
			and(
				eq(cloudWorkspaces.id, row.id),
				eq(cloudWorkspaces.providerSandboxId, row.providerSandboxId),
				pastWait(row.status, now),
			),
		)
		.returning({ id: cloudWorkspaces.id });
	if (!retired) return false;
	if (row.status === "archived") await reapWorkspaceFiles(row.id);
	if (failAs) {
		logControl("workspace.failed", scope, { "failure.reason": failAs }, "warn");
		nudge(row.organizationId, "cloud_workspaces");
	}
	await teardownBox(row.providerSandboxId);
	return true;
}

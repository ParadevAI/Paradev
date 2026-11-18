import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import type { CloudWorkspaceFailureReason } from "@superset/db/enums";
import type { CloudWorkspaceStatus } from "@superset/db/schema";
import { cloudWorkspaces } from "@superset/db/schema";
import { isCloudUsageRefusal } from "@superset/shared/billing";
import { and, eq, inArray } from "drizzle-orm";
import {
	type ControlScope,
	controlTags,
	logControl,
} from "../../lib/control-log";
import { nudge } from "../../lib/realtime";

type Move = {
	id: string;
	from: readonly CloudWorkspaceStatus[];
	set?: Partial<typeof cloudWorkspaces.$inferInsert>;
};

async function moveCloudWorkspace(
	args: Move & { to: CloudWorkspaceStatus },
): Promise<boolean> {
	const moved = await db
		.update(cloudWorkspaces)
		.set({ ...args.set, status: args.to })
		.where(
			and(
				eq(cloudWorkspaces.id, args.id),
				inArray(cloudWorkspaces.status, [...args.from]),
			),
		)
		.returning({ id: cloudWorkspaces.id });
	return moved.length > 0;
}

/**
 * Moves a cloud workspace between statuses only from the ones it may leave.
 * The provisioning job and a delete race on the same row: a delete that
 * lands while the box is being made must win, or the job would flip a
 * `archived` row back to `awake` and strand a billed sandbox nothing lists.
 * Returns false when the row was no longer in any of `from`. A row that is
 * live again drops its failure; an archived one keeps why it failed. Only
 * `failCloudWorkspace` moves a row to `failed`.
 */
export function transitionCloudWorkspace(
	args: Move & { to: Exclude<CloudWorkspaceStatus, "failed"> },
): Promise<boolean> {
	return moveCloudWorkspace(
		args.to === "archived"
			? args
			: { ...args, set: { failureReason: null, failedAt: null, ...args.set } },
	);
}

/** An Autumn refusal is an expected state: it is logged as a warning and opens no Sentry issue. */
export async function failCloudWorkspace(args: {
	scope: ControlScope;
	from: readonly CloudWorkspaceStatus[];
	set?: Partial<typeof cloudWorkspaces.$inferInsert>;
	reason: CloudWorkspaceFailureReason;
	error: unknown;
}): Promise<void> {
	const { scope } = args;
	const changed = await moveCloudWorkspace({
		id: scope.cloudWorkspaceId,
		from: args.from,
		to: "failed",
		set: { ...args.set, failureReason: args.reason, failedAt: new Date() },
	});
	nudge(scope.organizationId, "cloud_workspaces");
	if (!changed) return;
	const refused = isCloudUsageRefusal(args.error);
	logControl(
		"workspace.failed",
		scope,
		{ "failure.reason": args.reason },
		refused ? "warn" : "error",
	);
	if (!refused) {
		Sentry.captureException(args.error, { tags: controlTags(scope) });
	}
}

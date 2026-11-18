import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
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

/**
 * Moves a cloud workspace between statuses only from the ones it may leave.
 * The provisioning job and a delete race on the same row: a delete that
 * lands while the box is being made must win, or the job would flip a
 * `archived` row back to `awake` and strand a billed sandbox nothing lists.
 * Returns false when the row was no longer in any of `from`.
 */
export async function transitionCloudWorkspace(args: {
	id: string;
	from: readonly CloudWorkspaceStatus[];
	to: CloudWorkspaceStatus;
	set?: Partial<typeof cloudWorkspaces.$inferInsert>;
}): Promise<boolean> {
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

/** An Autumn refusal is an expected state: it is logged as a warning and opens no Sentry issue. */
export async function failCloudWorkspace(args: {
	scope: ControlScope;
	from: readonly CloudWorkspaceStatus[];
	set?: Partial<typeof cloudWorkspaces.$inferInsert>;
	site: "provision" | "queue";
	error: unknown;
}): Promise<void> {
	const { scope } = args;
	const changed = await transitionCloudWorkspace({
		id: scope.cloudWorkspaceId,
		from: args.from,
		to: "failed",
		set: args.set,
	});
	nudge(scope.organizationId, "cloud_workspaces");
	if (!changed) return;
	const refused = isCloudUsageRefusal(args.error);
	logControl(
		"workspace.failed",
		scope,
		{ "failure.site": args.site },
		refused ? "warn" : "error",
	);
	if (!refused) {
		Sentry.captureException(args.error, { tags: controlTags(scope) });
	}
}

import { db } from "@superset/db/client";
import type { cloudWorkspaces } from "@superset/db/schema";
import { nudge } from "../../lib/realtime";
import { deleteSandbox } from "../../lib/sandbox";
import { recordCloudWorkspaceActivity } from "./activity";
import { settleWorkspaceNow } from "./meter";
import { queueReap } from "./reap";
import { transitionCloudWorkspace } from "./transition";

/**
 * Archives a cloud workspace for this person. The box keeps running until the
 * reap stops it, so an undo is instant.
 */
export async function archiveCloudWorkspace(
	row: typeof cloudWorkspaces.$inferSelect,
	userId: string,
): Promise<boolean> {
	const archivedAt = new Date();
	// From any state, provisioning included: the job checks the row
	// before it marks it ready and tears its box down when this won.
	const archived = await transitionCloudWorkspace({
		id: row.id,
		from: ["provisioning", "ready", "failed"],
		to: "deleted",
		set: { sandboxUrl: null, deletedAt: archivedAt },
	});
	if (archived) {
		// A row from a retired provider has no sandbox left to keep.
		if (row.provider === "vercel") {
			await queueReap(
				{ cloudWorkspaceId: row.id, archivedAt: archivedAt.toISOString() },
				row.providerSandboxId,
			).catch(async (error) => {
				console.error(
					`[cloud-workspace] could not queue the reap for ${row.id}`,
					error,
				);
				await settleWorkspaceNow(row.id).catch((meterError) =>
					console.error(
						`[cloud-workspace] ${row.id} final meter failed`,
						meterError,
					),
				);
				await deleteSandbox(row.providerSandboxId);
			});
		}
		await recordCloudWorkspaceActivity(
			db,
			row.id,
			{ kind: "user", userId },
			{ event: "archived" },
		).catch((error) => {
			console.error(
				`[cloud-workspace] ${row.id} archive activity write failed`,
				error,
			);
		});
	}
	nudge(row.organizationId, "cloud_workspaces");
	return Boolean(archived);
}

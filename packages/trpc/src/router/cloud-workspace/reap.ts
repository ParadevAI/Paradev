import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { logControl } from "../../lib/control-log";
import { detachAll, reapOrphanFiles } from "../../lib/files";
import {
	describeSandbox,
	rerunBoxStartHook,
	runBoxArchiveHook,
	sandboxHostSecretFor,
	stopSandbox,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { queueSettleWorkspace } from "./meter";
import { recordBoxStopped } from "./sandbox-sleep";

/** How long an archived workspace keeps its box running, so an undo finds it live. */
export const ARCHIVE_STOP_DELAY_SECONDS = 60;
/** How long an archived workspace keeps its stopped box for an unarchive to resume. */
export const ARCHIVE_GRACE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Past it an unarchive is refused, even before the cleanup job deletes the
 * box. Rows archived before `deleted_at` existed count from their last write.
 */
export function archiveWaitIsOver(
	row: { deletedAt: Date | null; updatedAt: Date },
	now = Date.now(),
): boolean {
	const archivedAt = row.deletedAt ?? row.updatedAt;
	return now - archivedAt.getTime() >= ARCHIVE_GRACE_SECONDS * 1000;
}

export interface ReapArchivedCloudWorkspaceInput {
	cloudWorkspaceId: string;
	/** The archive this reap belongs to; a later archive queues its own. */
	archivedAt: string;
	/** `delete` only arrives from archives queued before the cleanup job took the delete over. */
	stage: "stop" | "delete";
}

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

function isStillArchived(
	row: CloudWorkspaceRow | undefined,
	input: ReapArchivedCloudWorkspaceInput,
): row is CloudWorkspaceRow {
	return (
		row !== undefined &&
		row.status === "archived" &&
		row.deletedAt?.toISOString() === input.archivedAt &&
		row.provider === "vercel"
	);
}

function findRow(id: string) {
	return db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
}

/**
 * Runs the repository's cloud `[archive]` on the still-running box, so what
 * its `setup` created outside the box is released. Best effort: the stop
 * goes ahead whatever happens. Returns false when the workspace was
 * unarchived while the hook ran, so the caller must not stop the box.
 */
async function runArchiveHook(
	row: CloudWorkspaceRow,
	input: ReapArchivedCloudWorkspaceInput,
): Promise<boolean> {
	const box = await describeSandbox(row.providerSandboxId).catch(() => null);
	if (!box?.running) return true;
	const hostSecret = await sandboxHostSecretFor(row.id);
	const outcome = await runBoxArchiveHook({
		hostTarget: box.hostTarget,
		hostSecret,
	});
	if (outcome.kind === "error") {
		console.error(`[cloud-workspace] ${row.id} archive hook`, outcome.message);
	} else if (outcome.kind === "ran" && outcome.status !== "skipped") {
		console.log(`[cloud-workspace] ${row.id} archive hook ${outcome.status}`);
	}
	if (isStillArchived(await findRow(row.id), input)) return true;
	// Undone mid-hook: setup re-creates what the hook released.
	const rerun = await rerunBoxStartHook({
		hostTarget: box.hostTarget,
		hostSecret,
	});
	if (rerun.kind === "error") {
		console.error(`[cloud-workspace] ${row.id} setup re-run`, rerun.message);
	}
	return false;
}

export async function reapArchivedCloudWorkspace(
	input: ReapArchivedCloudWorkspaceInput,
): Promise<"stopped" | "skipped"> {
	const row = await findRow(input.cloudWorkspaceId);
	if (!isStillArchived(row, input)) {
		return "skipped";
	}
	if (input.stage === "delete") {
		console.log(
			`[cloud-workspace] ${row.id} reap delete left to the cleanup job (rule 1)`,
		);
		return "skipped";
	}
	if (!(await runArchiveHook(row, input))) return "skipped";
	const stopped = await stopSandbox(row.providerSandboxId);
	await recordBoxStopped(
		{ cloudWorkspaceId: row.id, organizationId: row.organizationId },
		{
			sessionId: stopped.sessionId ?? row.sandboxSessionId,
			reason: "archived",
		},
	);
	await queueSettleWorkspace(row.id);
	logControl("archive.stopped", {
		cloudWorkspaceId: row.id,
		organizationId: row.organizationId,
	});
	return "stopped";
}

/** Drops the files sent to a workspace whose box is gone for good. */
export async function reapWorkspaceFiles(cloudWorkspaceId: string) {
	await reapOrphanFiles(
		await detachAll({
			parentKind: "cloud_workspace",
			parentIds: [cloudWorkspaceId],
		}),
	).catch((error) =>
		console.error(
			`[cloud-workspace] ${cloudWorkspaceId} file reap failed`,
			error,
		),
	);
}

function queueReapStage(
	input: ReapArchivedCloudWorkspaceInput,
	delaySeconds: number,
): Promise<void> {
	return publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/reap",
		body: input,
		delaySeconds,
		runLocally: reapArchivedCloudWorkspace,
	});
}

/**
 * Stops the box after a short delay; a stop that could not be queued happens
 * now instead. The cleanup job deletes the box once the grace period is over.
 */
export async function queueReap(
	input: Omit<ReapArchivedCloudWorkspaceInput, "stage">,
	box: {
		organizationId: string;
		providerSandboxId: string;
		sandboxSessionId: string | null;
	},
): Promise<void> {
	await queueReapStage(
		{ ...input, stage: "stop" },
		ARCHIVE_STOP_DELAY_SECONDS,
	).catch(async (error) => {
		console.error(
			`[cloud-workspace] could not queue the stop for ${input.cloudWorkspaceId}`,
			error,
		);
		const stopped = await stopSandbox(box.providerSandboxId);
		await recordBoxStopped(
			{
				cloudWorkspaceId: input.cloudWorkspaceId,
				organizationId: box.organizationId,
			},
			{
				sessionId: stopped.sessionId ?? box.sandboxSessionId,
				reason: "archived",
			},
		);
	});
}

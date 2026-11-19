import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, type SQL } from "drizzle-orm";
import {
	DriveStillAttachedError,
	deleteSandbox,
	deleteWorkspaceDrive,
	sandboxDeletesAllowed,
	stopSandbox,
	waitForDriveDetached,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { nextSandboxNameFor } from "./sandbox-name";
import { liveReferences } from "./teardown-guard";

export interface TeardownSandboxInput {
	providerSandboxId: string;
	driveName: string | null;
	attempt: number;
	/** The drive is only waited for, never deleted: another box of the row runs on it. */
	keepDrive?: boolean;
}

/** One attempt fits a short request; a drive still flushing is tried again later. */
export const TEARDOWN_DETACH_WAIT_MS = 20_000;
export const TEARDOWN_RETRY_SECONDS = 30;
export const TEARDOWN_ATTEMPTS = 20;

export type TeardownOutcome =
	| "deleted"
	| "kept"
	| "retrying"
	| "abandoned"
	| "skipped";

/**
 * Stops the box, waits briefly for its drive to detach, then deletes the box
 * and the drive. A drive still attached, or any other failure, requeues the
 * job rather than wait in the caller. Before each destructive call it reads
 * the rows again: what a live workspace or environment names is kept.
 */
export async function teardownSandbox(
	input: TeardownSandboxInput,
): Promise<TeardownOutcome> {
	const what = `box ${input.providerSandboxId} and ${input.keepDrive || !input.driveName ? "no drive" : `drive ${input.driveName}`}`;
	if (!sandboxDeletesAllowed(what)) return "skipped";
	try {
		return await teardownOnce(input);
	} catch (error) {
		Sentry.captureException(error, { extra: { ...input } });
		return retryOrAbandon(input, error);
	}
}

async function teardownOnce(
	input: TeardownSandboxInput,
): Promise<TeardownOutcome> {
	if ((await liveReferences(input)).sandbox) return kept(input, "sandbox");
	await stopSandbox(input.providerSandboxId);
	if (input.driveName) {
		try {
			await waitForDriveDetached(input.driveName, {
				timeoutMs: TEARDOWN_DETACH_WAIT_MS,
				// A kept drive only has to leave this box; the row's other box may hold it for good.
				...(input.keepDrive
					? {
							heldByCaller: async (attachedTo: string) =>
								attachedTo !== input.providerSandboxId,
						}
					: {}),
			});
		} catch (error) {
			if (!(error instanceof DriveStillAttachedError)) throw error;
			return retryOrAbandon(input, error);
		}
	}
	const live = await liveReferences(input);
	if (live.sandbox) return kept(input, "sandbox");
	await deleteSandbox(input.providerSandboxId);
	if (input.keepDrive) return "deleted";
	if (live.drive) return kept(input, "drive");
	if ((await liveReferences(input)).drive) return kept(input, "drive");
	await deleteWorkspaceDrive(input.driveName);
	return "deleted";
}

function kept(
	input: TeardownSandboxInput,
	what: "sandbox" | "drive",
): TeardownOutcome {
	console.log(
		`[cloud-workspace] teardown kept the ${what} of ${input.providerSandboxId}: a live row names it`,
	);
	return "kept";
}

async function retryOrAbandon(
	input: TeardownSandboxInput,
	error: unknown,
): Promise<TeardownOutcome> {
	if (input.attempt + 1 >= TEARDOWN_ATTEMPTS) {
		Sentry.captureMessage(
			`cloud workspace teardown gave up on ${input.providerSandboxId} and its drive ${input.driveName}`,
			{ level: "error", extra: { ...input, error: String(error) } },
		);
		return "abandoned";
	}
	await queueTeardown(
		{ ...input, attempt: input.attempt + 1 },
		TEARDOWN_RETRY_SECONDS,
	);
	return "retrying";
}

function queueTeardown(
	input: TeardownSandboxInput,
	delaySeconds?: number,
): Promise<void> {
	return publishCloudWorkspaceJob({
		path: "/api/cloud-workspaces/teardown",
		body: input,
		delaySeconds,
		runLocally: teardownSandbox,
	});
}

/** Every box, with a drive or without, goes through the retried job and its re-read before the delete. */
export async function deleteSandboxAndDriveLater(args: {
	providerSandboxId: string;
	driveName: string | null | undefined;
	keepDrive?: boolean;
}): Promise<void> {
	await queueTeardown({
		providerSandboxId: args.providerSandboxId,
		driveName: args.driveName ?? null,
		attempt: 0,
		...(args.keepDrive ? { keepDrive: true } : {}),
	});
}

/**
 * Takes the row's box and drive names out of use in the same write that
 * commits to deleting them, then queues their teardown. An unarchive after it
 * finds a name that does not exist and gets a new box and a new drive, never
 * the ones being deleted. Returns false when the row no longer matches
 * `condition` or names another box: whatever changed it owns the names now.
 */
export async function retireAndTearDown(
	row: { id: string; providerSandboxId: string; driveName: string | null },
	condition: SQL | undefined,
): Promise<boolean> {
	const [retired] = await db
		.update(cloudWorkspaces)
		.set({
			providerSandboxId: nextSandboxNameFor(row.id),
			driveName: null,
			driveLaidOutAt: null,
		})
		.where(
			and(
				eq(cloudWorkspaces.id, row.id),
				eq(cloudWorkspaces.providerSandboxId, row.providerSandboxId),
				condition,
			),
		)
		.returning({ id: cloudWorkspaces.id });
	if (!retired) return false;
	await deleteSandboxAndDriveLater({
		providerSandboxId: row.providerSandboxId,
		driveName: row.driveName,
	});
	return true;
}

import * as Sentry from "@sentry/core";
import {
	DriveStillAttachedError,
	deleteSandbox,
	deleteWorkspaceDrive,
	stopSandbox,
	waitForDriveDetached,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { liveReferences } from "./teardown-guard";

export interface TeardownSandboxInput {
	providerSandboxId: string;
	driveName: string | null;
	attempt: number;
}

/** One attempt fits a short request; a drive still flushing is tried again later. */
export const TEARDOWN_DETACH_WAIT_MS = 20_000;
export const TEARDOWN_RETRY_SECONDS = 30;
export const TEARDOWN_ATTEMPTS = 20;

export type TeardownOutcome = "deleted" | "kept" | "retrying" | "abandoned";

/**
 * Stops the box, waits briefly for its drive to detach, then deletes the box
 * and the drive. A drive still attached, or any other failure, requeues the
 * job rather than wait in the caller. Before each destructive call it reads
 * the rows again: what a live workspace or environment names is kept.
 */
export async function teardownSandbox(
	input: TeardownSandboxInput,
): Promise<TeardownOutcome> {
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
			});
		} catch (error) {
			if (!(error instanceof DriveStillAttachedError)) throw error;
			return retryOrAbandon(input, error);
		}
	}
	const live = await liveReferences(input);
	if (live.sandbox) return kept(input, "sandbox");
	await deleteSandbox(input.providerSandboxId);
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

/** A box without a drive is deleted now, as before; one with a drive through the retried job. */
export async function deleteSandboxAndDriveLater(args: {
	providerSandboxId: string;
	driveName: string | null | undefined;
}): Promise<void> {
	if (!args.driveName) return deleteSandbox(args.providerSandboxId);
	await queueTeardown({
		providerSandboxId: args.providerSandboxId,
		driveName: args.driveName,
		attempt: 0,
	});
}

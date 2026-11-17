import {
	DriveStillAttachedError,
	deleteSandbox,
	deleteWorkspaceDrive,
	stopSandbox,
	waitForDriveDetached,
} from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";

export interface TeardownSandboxInput {
	providerSandboxId: string;
	driveName: string | null;
	attempt: number;
}

/** One attempt fits a short request; a drive still flushing is tried again later. */
export const TEARDOWN_DETACH_WAIT_MS = 20_000;
export const TEARDOWN_RETRY_SECONDS = 30;
export const TEARDOWN_ATTEMPTS = 20;

/**
 * Stops the box, waits briefly for its drive to detach, then deletes the box
 * and the drive. A drive still attached requeues the job rather than wait in
 * the caller: a sandbox deleted while it holds its drive leaves the drive
 * attached for minutes.
 */
export async function teardownSandbox(
	input: TeardownSandboxInput,
): Promise<"deleted" | "retrying" | "abandoned"> {
	await stopSandbox(input.providerSandboxId);
	if (input.driveName) {
		try {
			await waitForDriveDetached(input.driveName, {
				timeoutMs: TEARDOWN_DETACH_WAIT_MS,
			});
		} catch (error) {
			if (!(error instanceof DriveStillAttachedError)) throw error;
			if (input.attempt + 1 >= TEARDOWN_ATTEMPTS) {
				console.error(
					`[cloud-workspace] gave up deleting ${input.providerSandboxId} and its drive ${input.driveName}`,
					error,
				);
				return "abandoned";
			}
			await queueTeardown(
				{ ...input, attempt: input.attempt + 1 },
				TEARDOWN_RETRY_SECONDS,
			);
			return "retrying";
		}
	}
	await deleteSandbox(input.providerSandboxId);
	await deleteWorkspaceDrive(input.driveName);
	return "deleted";
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

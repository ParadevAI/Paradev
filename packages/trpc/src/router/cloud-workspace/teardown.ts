import * as Sentry from "@sentry/core";
import { deleteSandbox, stopSandbox } from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { liveReferences } from "./teardown-guard";

export const TEARDOWN_JOB_PATH = "/api/cloud-workspaces/teardown";

export interface TeardownSandboxInput {
	providerSandboxId: string;
	/** Always null until workspace drives exist; #9847 tears down the drive here. */
	driveName: null;
	attempt: number;
}

export const TEARDOWN_RETRY_SECONDS = 30;
export const TEARDOWN_ATTEMPTS = 20;

export type TeardownOutcome = "deleted" | "kept" | "retrying" | "abandoned";

/**
 * Stops the box, then deletes it with its snapshots. Before each destructive
 * call it reads the rows again: a box a workspace or a live environment names
 * is kept. Any failure requeues the job.
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
	if ((await liveReferences(input)).sandbox) return kept(input);
	await stopSandbox(input.providerSandboxId);
	if ((await liveReferences(input)).sandbox) return kept(input);
	await deleteSandbox(input.providerSandboxId);
	console.log(`[cloud-workspace] teardown deleted ${input.providerSandboxId}`);
	return "deleted";
}

function kept(input: TeardownSandboxInput): TeardownOutcome {
	console.log(
		`[cloud-workspace] teardown kept ${input.providerSandboxId}: a live row names it`,
	);
	return "kept";
}

async function retryOrAbandon(
	input: TeardownSandboxInput,
	error: unknown,
): Promise<TeardownOutcome> {
	if (input.attempt + 1 >= TEARDOWN_ATTEMPTS) {
		Sentry.captureMessage(
			`cloud workspace teardown gave up on ${input.providerSandboxId}`,
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

export function queueTeardown(
	input: TeardownSandboxInput,
	delaySeconds?: number,
): Promise<void> {
	return publishCloudWorkspaceJob({
		path: TEARDOWN_JOB_PATH,
		body: input,
		delaySeconds,
		runLocally: teardownSandbox,
	});
}

import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { and, eq, type SQL } from "drizzle-orm";
import { deleteSandbox, stopSandbox } from "../../lib/sandbox";
import { publishCloudWorkspaceJob } from "./jobs";
import { nextSandboxNameFor } from "./provision";
import { liveReferences } from "./teardown-guard";

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

/** Every box goes through the retried job, which reads the rows again just before it deletes. */
export async function deleteSandboxAndDriveLater(args: {
	providerSandboxId: string;
	driveName: string | null | undefined;
	keepDrive?: boolean;
}): Promise<void> {
	if (args.driveName) {
		throw new Error(
			`no drive teardown yet: ${args.providerSandboxId} names drive ${args.driveName}`,
		);
	}
	await queueTeardown({
		providerSandboxId: args.providerSandboxId,
		driveName: null,
		attempt: 0,
	});
}

/**
 * Takes the row's box name out of use in the same write that commits to
 * deleting the box, then queues its teardown. A wake after it finds a name
 * that does not exist, never the box being deleted. `set` changes the row in
 * that same write, such as the status a retired row ends in. Returns false
 * when the row no longer matches `condition` or names another box.
 */
export async function retireAndTearDown(
	row: { id: string; providerSandboxId: string; driveName: string | null },
	condition: SQL | undefined,
	set: Partial<typeof cloudWorkspaces.$inferInsert> = {},
): Promise<boolean> {
	const [retired] = await db
		.update(cloudWorkspaces)
		.set({ ...set, providerSandboxId: nextSandboxNameFor(row.id) })
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

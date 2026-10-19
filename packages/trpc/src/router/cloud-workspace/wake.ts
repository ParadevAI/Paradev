import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	buildSandboxClaim,
	describeSandbox,
	stopAndSnapshot,
	wakeSandbox,
} from "../../lib/sandbox";
import {
	attachBootSession,
	authorizeBoot,
	queueSettleWorkspace,
} from "./meter";
import { transitionCloudWorkspace } from "./transition";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

export interface WokenCloudWorkspace {
	hostTarget: string;
	/** The creator's agent sign-ins changed after the box booted; only a restart hands them to running agents. */
	agentCredentialsChanged: boolean;
}

/** Resumes or extends the sandbox and records its current address. */
export async function wakeCloudWorkspace(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace> {
	const { claim, agentCredentialDigest } = await buildSandboxClaim({ row });
	let bootId: string | null = null;
	const { hostTarget, booted, sessionEndsAt } = await wakeSandbox({
		providerSandboxId: row.providerSandboxId,
		claim,
		beforeResume: async (box) => {
			({ bootId } = await authorizeBoot({
				organizationId: row.organizationId,
				cloudWorkspaceId: row.id,
				...box,
			}));
		},
	}).catch(async (error) => {
		if (bootId) {
			await attachBootSession({
				bootId,
				providerSandboxId: row.providerSandboxId,
			}).catch(() => {});
		}
		throw error;
	});
	if (bootId) {
		await attachBootSession({
			bootId,
			providerSandboxId: row.providerSandboxId,
		}).catch((error) => Sentry.captureException(error, { extra: { bootId } }));
	}
	const set: Partial<CloudWorkspaceRow> = {
		...(hostTarget !== row.sandboxUrl ? { sandboxUrl: hostTarget } : {}),
		...(booted ? { bootAgentCredentialDigest: agentCredentialDigest } : {}),
		...(sessionEndsAt?.getTime() !== row.sessionEndsAt?.getTime()
			? { sessionEndsAt }
			: {}),
	};
	if (Object.keys(set).length > 0) {
		await db
			.update(cloudWorkspaces)
			.set(set)
			.where(eq(cloudWorkspaces.id, row.id));
	}
	return {
		hostTarget,
		agentCredentialsChanged:
			!booted &&
			row.bootAgentCredentialDigest !== null &&
			row.bootAgentCredentialDigest !== agentCredentialDigest,
	};
}

/** For a box stopped before its session ran out, so the list stops showing its cut-off turn. */
export async function recordSessionEnded(
	row: CloudWorkspaceRow,
	now = new Date(),
): Promise<void> {
	if (row.sessionEndsAt && row.sessionEndsAt <= now) return;
	await db
		.update(cloudWorkspaces)
		.set({ sessionEndsAt: now })
		.where(eq(cloudWorkspaces.id, row.id));
	nudge(row.organizationId, "cloud_workspaces");
}

/** Ends every process on the box and boots it again from a fresh claim. */
export async function restartCloudWorkspace(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace> {
	const { running } = await describeSandbox(row.providerSandboxId);
	if (running) {
		await stopAndSnapshot(row.providerSandboxId);
		await queueSettleWorkspace(row.id);
	}
	return wakeCloudWorkspace(row);
}

/**
 * For a sandbox that is gone or can never resume. A `ready` row nothing can
 * open would sit in the sidebar forever; failed is the state the client
 * already renders with a way out.
 */
export async function markSandboxUnavailable(
	row: CloudWorkspaceRow,
	error: unknown,
): Promise<void> {
	await transitionCloudWorkspace({
		id: row.id,
		from: ["ready"],
		to: "failed",
		set: { sandboxUrl: null },
	});
	nudge(row.organizationId, "cloud_workspaces");
	console.error(`[cloud-workspace] ${row.id} sandbox unavailable`, error);
}

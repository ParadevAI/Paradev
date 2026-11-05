import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import {
	CLOUD_WORKSPACE_BOOTED_ATTRIBUTE,
	CLOUD_WORKSPACE_WAKE_TRANSACTION,
} from "@superset/shared/constants";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { nudge } from "../../lib/realtime";
import {
	bootBeganSince,
	buildSandboxClaim,
	describeSandbox,
	recordBootSpans,
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
	try {
		return await Sentry.startSpan(
			{
				name: CLOUD_WORKSPACE_WAKE_TRANSACTION,
				op: "function",
				forceTransaction: true,
				attributes: { "cloud_workspace.id": row.id },
			},
			async (span) => {
				const { booted, rebooted, ...woken } = await wake(row);
				span.setAttributes({
					"cloud_workspace.resumed": booted,
					[CLOUD_WORKSPACE_BOOTED_ATTRIBUTE]: rebooted,
				});
				return woken;
			},
		);
	} finally {
		waitUntil(Sentry.flush(2_000).catch(() => false));
	}
}

async function wake(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace & { booted: boolean; rebooted: boolean }> {
	const { claim, agentCredentialDigest } = await Sentry.startSpan(
		{ name: "claim", op: "sandbox" },
		() => buildSandboxClaim({ row }),
	);
	let bootId: string | null = null;
	const wakeStartedAt = Date.now();
	const { hostTarget, booted, rebooted, answer } = await wakeSandbox({
		providerSandboxId: row.providerSandboxId,
		claim,
		beforeResume: async (box) => {
			({ bootId } = await Sentry.startSpan(
				{ name: "authorize boot", op: "billing" },
				() =>
					authorizeBoot({
						organizationId: row.organizationId,
						cloudWorkspaceId: row.id,
						createdByUserId: row.createdByUserId,
						...box,
					}),
			));
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
	if (rebooted && bootBeganSince(answer, wakeStartedAt)) {
		try {
			recordBootSpans(answer);
		} catch (error) {
			console.error(
				`[cloud-workspace] could not trace the boot of ${row.id}`,
				error,
			);
		}
	}
	const set: Partial<CloudWorkspaceRow> = {
		...(hostTarget !== row.sandboxUrl ? { sandboxUrl: hostTarget } : {}),
		...(booted ? { bootAgentCredentialDigest: agentCredentialDigest } : {}),
	};
	if (Object.keys(set).length > 0) {
		await db
			.update(cloudWorkspaces)
			.set(set)
			.where(eq(cloudWorkspaces.id, row.id));
	}
	return {
		hostTarget,
		booted,
		rebooted,
		agentCredentialsChanged:
			!booted &&
			row.bootAgentCredentialDigest !== null &&
			row.bootAgentCredentialDigest !== agentCredentialDigest,
	};
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

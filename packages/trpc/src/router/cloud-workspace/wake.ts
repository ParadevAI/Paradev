import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import { isCloudUsageRefusal } from "@superset/shared/billing";
import {
	CLOUD_WORKSPACE_BOOTED_ATTRIBUTE,
	CLOUD_WORKSPACE_WAKE_TRANSACTION,
} from "@superset/shared/constants";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import {
	type ControlScope,
	controlTags,
	logControl,
} from "../../lib/control-log";
import {
	agentsToRestart,
	bootBeganSince,
	bootPhases,
	buildSandboxClaim,
	describeSandbox,
	type SandboxUnavailableError,
	scheduleRulesRefresh,
	stopAndSnapshot,
	stopSandbox,
	wakeSandbox,
} from "../../lib/sandbox";
import {
	attachBootSession,
	authorizeBoot,
	queueSettleWorkspace,
} from "./meter";
import { recordSandboxAwake } from "./sandbox-expiry";
import {
	recordBootTrace,
	recordBoxStopped,
	recordSandboxAsleep,
} from "./sandbox-sleep";
import { failCloudWorkspace } from "./transition";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

export interface WokenCloudWorkspace {
	hostTarget: string;
	/** Agents whose sign-in kind changed since the box booted; only a restart hands it to them. */
	agentsToRestart: string[];
	/** For desktops from before agentsToRestart. */
	agentCredentialsChanged: boolean;
}

/** Resumes or extends the sandbox and records its current address. */
export async function wakeCloudWorkspace(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace>;
/** Hands the current sign-ins to a running box; null when the box is stopped. */
export async function wakeCloudWorkspace(
	row: CloudWorkspaceRow,
	options: { adoptSignIns: true },
): Promise<WokenCloudWorkspace | null>;
export async function wakeCloudWorkspace(
	row: CloudWorkspaceRow,
	options: { adoptSignIns?: boolean } = {},
): Promise<WokenCloudWorkspace | null> {
	try {
		return await Sentry.startSpan(
			{
				name: CLOUD_WORKSPACE_WAKE_TRANSACTION,
				op: "function",
				forceTransaction: true,
				attributes: { "cloud_workspace.id": row.id },
			},
			async (span) => {
				const result = await wake(row, options, span);
				if (!result) return null;
				const { booted, rebooted, ...woken } = result;
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

/**
 * `adoptSignIns` marks a running box's sign-ins current without a boot: the
 * caller restarts the one agent that needs them, and the others keep theirs.
 * A stopped box is left for its next wake, which hands them over anyway.
 */
async function wake(
	row: CloudWorkspaceRow,
	{ adoptSignIns = false }: { adoptSignIns?: boolean },
	span: Sentry.Span,
): Promise<
	(WokenCloudWorkspace & { booted: boolean; rebooted: boolean }) | null
> {
	const { claim, agentCredentialDigest, rulesExpireAt } =
		await Sentry.startSpan({ name: "claim", op: "sandbox" }, () =>
			buildSandboxClaim({ row }),
		);
	const scope: ControlScope = {
		cloudWorkspaceId: row.id,
		organizationId: row.organizationId,
	};
	let bootId: string | null = null;
	let resumed: { sessionId: string | null; expiresAt: Date | null } | undefined;
	const wakeStartedAt = Date.now();
	const woken = await wakeSandbox({
		providerSandboxId: row.providerSandboxId,
		claim,
		onlyIfRunning: adoptSignIns,
		beforeResume: async ({ resumedSession, ...box }) => {
			resumed = resumedSession;
			({ bootId } = await Sentry.startSpan(
				{ name: "authorize boot", op: "billing" },
				() =>
					authorizeBoot({
						organizationId: row.organizationId,
						cloudWorkspaceId: row.id,
						createdByUserId: row.createdByUserId,
						...box,
						origin: "wake",
						traceId: span.spanContext().traceId,
					}),
			));
			if (bootId) {
				scope.bootId = bootId;
				span.setAttribute("boot.id", bootId);
			}
		},
	}).catch(async (error) => {
		if (!isCloudUsageRefusal(error)) {
			logControl(
				"wake.failed",
				scope,
				{ ms: Date.now() - wakeStartedAt },
				"error",
			);
		}
		if (bootId) {
			await attachBootSession({
				bootId,
				providerSandboxId: row.providerSandboxId,
			}).catch(() => {});
		}
		// A call here resumed the box, and no boot meters that session.
		if (resumed && isCloudUsageRefusal(error)) {
			console.error(
				`[cloud-workspace] ${row.id} was resumed past its limit; stopping it`,
			);
			try {
				if (resumed.expiresAt) {
					await recordSandboxAwake(row.id, {
						expiresAt: resumed.expiresAt,
						sessionId: resumed.sessionId,
					});
				}
				const stopped = await stopSandbox(row.providerSandboxId);
				await recordSandboxAsleep(row.id, {
					sessionId: stopped.sessionId ?? resumed.sessionId,
				});
				logControl("meter.cap_stopped", scope, { source: "wake" }, "warn");
			} catch (stopError) {
				Sentry.captureException(stopError, { tags: controlTags(scope) });
			}
		}
		throw error;
	});
	if (!woken) return null;
	const { hostTarget, booted, rebooted, answer, expiresAt, sessionId } = woken;
	if (bootId) {
		await attachBootSession({
			bootId,
			providerSandboxId: row.providerSandboxId,
		}).catch((error) =>
			Sentry.captureException(error, { tags: controlTags(scope) }),
		);
	}
	await recordBootTrace(
		scope,
		span,
		rebooted && bootBeganSince(answer, wakeStartedAt) ? bootPhases(answer) : [],
	);
	const set: Partial<CloudWorkspaceRow> = {
		...(hostTarget !== row.sandboxUrl ? { sandboxUrl: hostTarget } : {}),
		...(booted || adoptSignIns
			? { bootAgentCredentialDigest: agentCredentialDigest }
			: {}),
	};
	if (Object.keys(set).length > 0) {
		await db
			.update(cloudWorkspaces)
			.set(set)
			.where(eq(cloudWorkspaces.id, row.id));
	}
	if (expiresAt) await recordSandboxAwake(row.id, { expiresAt, sessionId });
	await scheduleRulesRefresh(row.id, rulesExpireAt);
	if (rebooted) {
		logControl("wake.completed", scope, {
			ms: Date.now() - wakeStartedAt,
			"box.resumed": booted,
		});
	}
	const restart =
		booted || adoptSignIns
			? []
			: agentsToRestart(row.bootAgentCredentialDigest, agentCredentialDigest);
	return {
		hostTarget,
		booted,
		rebooted,
		agentsToRestart: restart,
		agentCredentialsChanged: restart.length > 0,
	};
}

/** Ends every process on the box and boots it again from a fresh claim. */
export async function restartCloudWorkspace(
	row: CloudWorkspaceRow,
): Promise<WokenCloudWorkspace> {
	const { running } = await describeSandbox(row.providerSandboxId);
	if (!running) return wakeCloudWorkspace(row);
	return wakeAfterStop(row, await stopAndSnapshot(row.providerSandboxId));
}

/** Starts a box again after the caller ended its session, as a metered wake. */
export async function wakeAfterStop(
	row: CloudWorkspaceRow,
	stopped: { sessionId: string | null },
): Promise<WokenCloudWorkspace> {
	await recordBoxStopped(
		{ cloudWorkspaceId: row.id, organizationId: row.organizationId },
		{
			sessionId: stopped.sessionId ?? row.sandboxSessionId,
			reason: "restarted",
		},
	);
	await queueSettleWorkspace(row.id);
	return wakeCloudWorkspace(row);
}

/**
 * For a sandbox that is gone or can never resume. An `awake` row nothing can
 * open would sit in the sidebar forever; failed is the state the client
 * already renders with a way out.
 */
export async function markSandboxUnavailable(
	row: CloudWorkspaceRow,
	error: SandboxUnavailableError,
): Promise<void> {
	console.error(`[cloud-workspace] ${row.id} sandbox unavailable`, error);
	await failCloudWorkspace({
		scope: { cloudWorkspaceId: row.id, organizationId: row.organizationId },
		from: ["awake", "asleep"],
		set: { sandboxUrl: null },
		reason: error.snapshotExpired ? "snapshot_expired" : "sandbox_gone",
		error,
	});
}

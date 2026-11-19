import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import type { CloudWorkspaceFailureReason } from "@superset/db/enums";
import { cloudWorkspaces } from "@superset/db/schema";
import { cloudUsageRefusalKey } from "@superset/shared/billing";
import type { CloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { CLOUD_WORKSPACE_PROVISION_TRANSACTION } from "@superset/shared/constants";
import { eq } from "drizzle-orm";
import { type ControlScope, controlTags } from "../../lib/control-log";
import { nudge } from "../../lib/realtime";
import {
	bootPhases,
	buildSandboxClaim,
	forkWorkspaceDrive,
	provisionSandbox,
	SandboxBusyError,
	SandboxDriveMissingError,
	SandboxDriveRefusedError,
	type SandboxEnvironment,
	SandboxNotReadyError,
	settleSandbox,
	stopSandbox,
	workspaceDriveMounts,
} from "../../lib/sandbox";
import {
	failChatMovesTo,
	queueChatMovesTo,
} from "../chat-move/utils/queueChatMove";
import { recordDriveLaidOut } from "./drive-laid-out";
import { generateCloudWorkspaceName } from "./generate-name";
import { publishCloudWorkspaceJob } from "./jobs";
import { attachBootSession, authorizeBoot, boxFor, releaseBoot } from "./meter";
import { sandboxResumeLock } from "./resume-lock";
import { recordSandboxAwake } from "./sandbox-expiry";
import { nextSandboxNameFor } from "./sandbox-name";
import { recordBootTrace, recordSandboxAsleep } from "./sandbox-sleep";
import { deleteSandboxAndDriveLater } from "./teardown";
import { failCloudWorkspace, transitionCloudWorkspace } from "./transition";

export const FALLBACK_NAME = "Cloud workspace";

/** Derived from the row id so the name is stable and collision-free. */
export function sandboxNameFor(cloudWorkspaceId: string): string {
	return `ws-${cloudWorkspaceId.replaceAll("-", "").slice(0, 24)}`;
}

export interface ProvisionCloudWorkspaceInput {
	cloudWorkspaceId: string;
	/**
	 * Set only when the user didn't type a name, in which case the row holds
	 * `FALLBACK_NAME` and this is what the workspace gets named from.
	 */
	namingPrompt?: string;
	/** A built-in agent to run once the sandbox is up; see cloud-agent-launch. */
	launch?: CloudAgentLaunch;
	/** How many times this provision found the box's resume lock held and requeued itself. */
	lockRetries?: number;
}

/** A lock held this long by others means something is stuck: the row is failed as for any error. */
const PROVISION_LOCK_RETRIES = 10;
const PROVISION_LOCK_RETRY_SECONDS = 15;

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

function provisionFailureReason(error: unknown): CloudWorkspaceFailureReason {
	switch (cloudUsageRefusalKey(error)) {
		case "serverError.cloudWorkspace.usageLimitReached":
			return "usage_limit";
		case "serverError.cloudWorkspace.cloudNeedsPaidPlan":
			return "needs_paid_plan";
	}
	return error instanceof SandboxNotReadyError ||
		error instanceof SandboxDriveRefusedError
		? "host_not_ready"
		: "create_failed";
}

/**
 * The name is on the row before the drive exists, so a delete that races
 * this provision still finds it. An unarchived workspace keeps its drive when
 * it still exists; a drive forked afresh has not been laid out yet.
 */
async function claimWorkspaceDrive(
	row: CloudWorkspaceRow,
	driveName: string,
	environment: SandboxEnvironment,
): Promise<"existing" | "forked"> {
	if (!row.driveName) {
		await db
			.update(cloudWorkspaces)
			.set({ driveName })
			.where(eq(cloudWorkspaces.id, row.id));
	}
	const outcome = await Sentry.startSpan({ name: "drive", op: "sandbox" }, () =>
		forkWorkspaceDrive({
			name: driveName,
			region: environment.region,
			goldenDriveName: environment.goldenDriveName ?? null,
		}),
	);
	if (outcome === "forked" && row.driveLaidOutAt) {
		await db
			.update(cloudWorkspaces)
			.set({ driveLaidOutAt: null })
			.where(eq(cloudWorkspaces.id, row.id));
	}
	return outcome;
}

export type ProvisionCloudWorkspaceOutcome =
	| "provisioned"
	| "skipped"
	| "retrying"
	| "failed";

/**
 * Everything a cloud workspace needs after its row exists: a sandbox with
 * its identity written and boot started, the `awake` status that makes it
 * openable, and the managed environment pushed once host-service answers.
 *
 * Runs detached from the create that asked for it, so it owns the row's
 * terminal state: it must leave `awake` or `failed` behind. The name is
 * generated alongside, off the sandbox's critical path: the box never
 * learns it, the API's row is what carries it.
 *
 * Safe to run twice on the same row: the provider calls are create-if-missing
 * and an already-`awake` row is left alone.
 */
export async function provisionCloudWorkspace(
	input: ProvisionCloudWorkspaceInput,
): Promise<ProvisionCloudWorkspaceOutcome> {
	const outcome = await Sentry.startSpan(
		{
			name: CLOUD_WORKSPACE_PROVISION_TRANSACTION,
			op: "job",
			forceTransaction: true,
			attributes: { "cloud_workspace.id": input.cloudWorkspaceId },
		},
		(span) => provision(input, span),
	);
	// The job runs after its request has answered, so nothing else flushes
	// the transaction before the runtime moves on.
	await Sentry.flush(2_000).catch(() => false);
	return outcome;
}

async function provision(
	input: ProvisionCloudWorkspaceInput,
	span: Sentry.Span,
): Promise<ProvisionCloudWorkspaceOutcome> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.cloudWorkspaceId),
	});
	if (!row) return "skipped";
	const scope: ControlScope = {
		cloudWorkspaceId: row.id,
		organizationId: row.organizationId,
	};
	if (row.status !== "provisioning") return "skipped";

	const providerSandboxId = row.providerSandboxId;
	const naming =
		input.namingPrompt === undefined
			? Promise.resolve()
			: generateCloudWorkspaceName(input.namingPrompt).then(
					async (generated) => {
						if (!generated || generated === row.name) return;
						await db
							.update(cloudWorkspaces)
							.set({ name: generated })
							.where(eq(cloudWorkspaces.id, row.id));
						nudge(row.organizationId, "cloud_workspaces");
					},
				);
	let bootId: string | null = null;
	let driveName = row.driveName;
	// Another delivery on the same box name, or a wake, may have brought the row up: only this job's own row is its to fail.
	let madeAwake = false;
	try {
		const {
			claim,
			environment,
			agentCredentialDigest,
			driveName: claimedDrive,
		} = await Sentry.startSpan({ name: "claim", op: "sandbox" }, () =>
			buildSandboxClaim({
				row,
				launch: input.launch,
				withRepoHooks: true,
				provisioning: true,
			}),
		);
		({ bootId } = await Sentry.startSpan(
			{ name: "authorize boot", op: "billing" },
			() =>
				authorizeBoot({
					organizationId: row.organizationId,
					cloudWorkspaceId: row.id,
					createdByUserId: row.createdByUserId,
					...boxFor(claim.vcpus),
					origin: "create",
					traceId: span.spanContext().traceId,
				}),
		));
		if (bootId) {
			scope.bootId = bootId;
			span.setAttribute("boot.id", bootId);
		}
		driveName = claimedDrive;
		if (driveName) await claimWorkspaceDrive(row, driveName, environment);
		const sandbox = await Sentry.startSpan(
			{ name: "create", op: "sandbox" },
			() =>
				provisionSandbox({
					name: providerSandboxId,
					environment,
					claim,
					mounts: workspaceDriveMounts(driveName),
					exclusive: sandboxResumeLock(driveName ?? providerSandboxId, {
						wait: true,
					}),
				}),
		);
		const ready = await transitionCloudWorkspace({
			id: row.id,
			from: ["provisioning"],
			to: "awake",
			onBox: providerSandboxId,
			set: {
				providerSandboxId: sandbox.providerSandboxId,
				sandboxUrl: sandbox.sandboxUrl,
				bootAgentCredentialDigest: agentCredentialDigest,
			},
		});
		madeAwake = ready;
		if (!ready) {
			// Deleted while the box was being made. The box is the row's, and the
			// archive's own reap stops and deletes it after that archive's grace
			// period: an undo, more work and a later archive must not lose it to
			// this job. A duplicate delivery loses the row to the first one.
			const current = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, row.id),
				columns: { status: true, providerSandboxId: true },
			});
			// An undo gave the row another box and a second provision: this box is no row's, and must not keep the drive.
			const overtaken =
				current !== undefined &&
				current.providerSandboxId !== providerSandboxId;
			if (overtaken) {
				if (bootId) await releaseBoot(bootId, "provision_abandoned");
				await deleteSandboxAndDriveLater({
					providerSandboxId,
					driveName,
					keepDrive: true,
				});
			} else if (current?.status === "archived") {
				await failChatMovesTo(row.id, "The cloud workspace was deleted").catch(
					(error) =>
						console.error(
							`[cloud-workspace] could not fail the chat moves into ${row.id}`,
							error,
						),
				);
				if (bootId) await releaseBoot(bootId, "provision_abandoned");
			}
			await naming.catch(() => {});
			return "skipped";
		}
		nudge(row.organizationId, "cloud_workspaces");
		if (sandbox.expiresAt) {
			await recordSandboxAwake(row.id, {
				expiresAt: sandbox.expiresAt,
				sessionId: sandbox.sessionId,
			});
		}
		if (bootId) {
			await attachBootSession({ bootId, providerSandboxId }).catch((error) =>
				Sentry.captureException(error, { tags: controlTags(scope) }),
			);
		}
		// The box is booting; the environment it needs arrives once host-service
		// answers. The client's own wake pushes it again, so a workspace nobody
		// opens still gets it (an agent launched at boot waits for this).
		const answer = await Sentry.startSpan(
			{ name: "settle", op: "sandbox" },
			() =>
				settleSandbox({
					providerSandboxId,
					hostTarget: sandbox.hostTarget,
					claim,
					bootId: sandbox.bootId,
				}),
		);
		if (driveName) await recordDriveLaidOut(row.id);
		await queueChatMovesTo(row.id).catch((error) =>
			console.error(
				`[cloud-workspace] could not start the chat moving into ${row.id}`,
				error,
			),
		);
		await recordBootTrace(scope, span, bootPhases(answer));
		await naming.catch((error) =>
			console.error(`[cloud-workspace] naming failed for ${row.id}`, error),
		);
		return "provisioned";
	} catch (error) {
		await naming.catch(() => {});
		// Another caller holds the box's lock: try again later, and touch nothing meanwhile.
		const lockRetries = input.lockRetries ?? 0;
		if (
			error instanceof SandboxBusyError &&
			lockRetries < PROVISION_LOCK_RETRIES
		) {
			if (bootId) {
				await releaseBoot(bootId, "provision_abandoned").catch((releaseError) =>
					console.error(
						`[cloud-workspace] could not release boot ${bootId}`,
						releaseError,
					),
				);
			}
			await publishCloudWorkspaceJob({
				path: "/api/cloud-workspaces/provision",
				body: { ...input, lockRetries: lockRetries + 1 },
				delaySeconds: PROVISION_LOCK_RETRY_SECONDS,
				runLocally: provisionCloudWorkspace,
			});
			return "retrying";
		}
		// The drive did not come up but its data is intact: the box sleeps, and the next wake mounts it afresh.
		if (error instanceof SandboxDriveMissingError && madeAwake) {
			const stopped = await stopSandbox(providerSandboxId).catch(() => ({
				sessionId: null,
			}));
			await recordSandboxAsleep(row.id, stopped);
			nudge(row.organizationId, "cloud_workspaces");
			if (bootId) {
				await releaseBoot(bootId, "provision_failed").catch((releaseError) =>
					console.error(
						`[cloud-workspace] could not release boot ${bootId}`,
						releaseError,
					),
				);
			}
			await queueChatMovesTo(row.id).catch((moveError) =>
				console.error(
					`[cloud-workspace] could not start the chat moving into ${row.id}`,
					moveError,
				),
			);
			console.warn(
				`[cloud-workspace] ${row.id} left asleep: its drive did not come up at create`,
			);
			return "provisioned";
		}
		if (bootId) {
			await releaseBoot(bootId, "provision_failed").catch((releaseError) =>
				console.error(
					`[cloud-workspace] could not release boot ${bootId}`,
					releaseError,
				),
			);
		}
		// A box that booted but whose host-service never answered is kept for
		// diagnosis, stopped: its boot log, desktop and shell are a resume
		// away, it costs storage rather than compute meanwhile, and a delete
		// from the sidebar still removes it. Any other failure must not leak
		// a box, since billing started at provision.
		const keepForDiagnosis =
			error instanceof SandboxNotReadyError ||
			error instanceof SandboxDriveRefusedError;
		// A box that goes is retired with the transition, so nothing can wake it while it is deleted; its drive stays on the failed row.
		const changed = await failCloudWorkspace({
			scope,
			from: madeAwake ? ["provisioning", "awake", "asleep"] : ["provisioning"],
			onBox: providerSandboxId,
			set: keepForDiagnosis
				? { providerSandboxId }
				: { providerSandboxId: nextSandboxNameFor(row.id) },
			reason: provisionFailureReason(error),
			error,
		});
		const teardownFailed = (teardownError: unknown) =>
			console.error(
				`[cloud-workspace] ${keepForDiagnosis ? "could not stop" : "leaked"} sandbox ${providerSandboxId}`,
				teardownError,
			);
		if (changed && keepForDiagnosis) {
			await stopSandbox(providerSandboxId).catch(teardownFailed);
		}
		if (changed && !keepForDiagnosis) {
			await deleteSandboxAndDriveLater({
				providerSandboxId,
				driveName: driveName ?? null,
				keepDrive: true,
			}).catch(teardownFailed);
		}
		if (changed) {
			await failChatMovesTo(
				row.id,
				"The cloud workspace could not start",
			).catch((moveError) =>
				console.error(
					`[cloud-workspace] could not fail the chat moves into ${row.id}`,
					moveError,
				),
			);
		}
		console.error(`[cloud-workspace] provisioning failed for ${row.id}`, error);
		return "failed";
	}
}

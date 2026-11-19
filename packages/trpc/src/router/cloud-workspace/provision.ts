import { randomBytes } from "node:crypto";
import * as Sentry from "@sentry/core";
import { db } from "@superset/db/client";
import type { CloudWorkspaceFailureReason } from "@superset/db/enums";
import { cloudWorkspaces } from "@superset/db/schema";
import { cloudUsageRefusalKey } from "@superset/shared/billing";
import type { CloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { CLOUD_WORKSPACE_PROVISION_TRANSACTION } from "@superset/shared/constants";
import { eq } from "drizzle-orm";
import { controlTags } from "../../lib/control-log";
import { nudge } from "../../lib/realtime";
import {
	bootPhases,
	buildSandboxClaim,
	provisionSandbox,
	SandboxNotReadyError,
	settleSandbox,
	stopSandbox,
} from "../../lib/sandbox";
import {
	failChatMovesTo,
	queueChatMovesTo,
} from "../chat-move/utils/queueChatMove";
import { generateCloudWorkspaceName } from "./generate-name";
import { attachBootSession, authorizeBoot, boxFor, releaseBoot } from "./meter";
import { recordSandboxAwake } from "./sandbox-expiry";
import { recordBootTrace } from "./sandbox-sleep";
import { failCloudWorkspace, transitionCloudWorkspace } from "./transition";

export const FALLBACK_NAME = "Cloud workspace";

/** Derived from the row id so the name is stable and collision-free. */
export function sandboxNameFor(cloudWorkspaceId: string): string {
	return `ws-${cloudWorkspaceId.replaceAll("-", "").slice(0, 24)}`;
}

/**
 * A later box for the same row. Vercel refuses a deleted sandbox's name
 * with `image_not_ready` for a few minutes after the delete.
 */
export function nextSandboxNameFor(cloudWorkspaceId: string): string {
	const prefix = cloudWorkspaceId.replaceAll("-", "").slice(0, 16);
	return `ws-${prefix}${randomBytes(4).toString("hex")}`;
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
}

function provisionFailureReason(error: unknown): CloudWorkspaceFailureReason {
	switch (cloudUsageRefusalKey(error)) {
		case "serverError.cloudWorkspace.usageLimitReached":
			return "usage_limit";
		case "serverError.cloudWorkspace.cloudNeedsPaidPlan":
			return "needs_paid_plan";
	}
	return error instanceof SandboxNotReadyError
		? "host_not_ready"
		: "create_failed";
}

export type ProvisionCloudWorkspaceOutcome =
	| "provisioned"
	| "skipped"
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
	try {
		const { claim, environment, agentCredentialDigest } =
			await Sentry.startSpan({ name: "claim", op: "sandbox" }, () =>
				buildSandboxClaim({ row, launch: input.launch, withRepoHooks: true }),
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
		if (bootId) span.setAttribute("boot.id", bootId);
		const sandbox = await Sentry.startSpan(
			{ name: "create", op: "sandbox" },
			() => provisionSandbox({ name: providerSandboxId, environment, claim }),
		);
		const ready = await transitionCloudWorkspace({
			id: row.id,
			from: ["provisioning"],
			to: "awake",
			set: {
				providerSandboxId: sandbox.providerSandboxId,
				sandboxUrl: sandbox.sandboxUrl,
				bootAgentCredentialDigest: agentCredentialDigest,
			},
		});
		if (!ready) {
			// Archived while the box was being made: the archive won the row, so
			// the box is stopped and left to the cleanup job's teardown. A
			// duplicate delivery of this job loses the row to the first one and
			// must leave the box be: the name is per workspace, so it is the same box.
			const current = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, row.id),
				columns: { status: true },
			});
			if (current?.status === "archived") {
				await failChatMovesTo(row.id, "The cloud workspace was deleted").catch(
					(error) =>
						console.error(
							`[cloud-workspace] could not fail the chat moves into ${row.id}`,
							error,
						),
				);
				await stopSandbox(providerSandboxId);
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
				Sentry.captureException(error, {
					tags: controlTags({
						cloudWorkspaceId: row.id,
						organizationId: row.organizationId,
						bootId,
					}),
				}),
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
				}),
		);
		await queueChatMovesTo(row.id).catch((error) =>
			console.error(
				`[cloud-workspace] could not start the chat moving into ${row.id}`,
				error,
			),
		);
		await recordBootTrace(
			{ cloudWorkspaceId: row.id, organizationId: row.organizationId, bootId },
			span,
			bootPhases(answer),
		);
		await naming.catch((error) =>
			console.error(`[cloud-workspace] naming failed for ${row.id}`, error),
		);
		return "provisioned";
	} catch (error) {
		await naming.catch(() => {});
		if (bootId) {
			await releaseBoot(bootId, "provision_failed").catch((releaseError) =>
				console.error(
					`[cloud-workspace] could not release boot ${bootId}`,
					releaseError,
				),
			);
		}
		// A failed create only stops the box: it costs storage, not compute,
		// its boot log is a resume away, and the cleanup job deletes it 30
		// days after the failure (rule 1).
		await stopSandbox(providerSandboxId).catch((stopError) => {
			console.error(
				`[cloud-workspace] could not stop sandbox ${providerSandboxId}`,
				stopError,
			);
		});
		await failCloudWorkspace({
			scope: {
				cloudWorkspaceId: row.id,
				organizationId: row.organizationId,
				bootId,
			},
			from: ["provisioning", "awake", "asleep"],
			set: { providerSandboxId },
			reason: provisionFailureReason(error),
			error,
		});
		await failChatMovesTo(row.id, "The cloud workspace could not start").catch(
			(moveError) =>
				console.error(
					`[cloud-workspace] could not fail the chat moves into ${row.id}`,
					moveError,
				),
		);
		console.error(`[cloud-workspace] provisioning failed for ${row.id}`, error);
		return "failed";
	}
}

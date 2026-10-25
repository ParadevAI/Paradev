import { db } from "@superset/db/client";
import {
	automationRuns,
	cloudWorkspaces,
	environments,
	members,
} from "@superset/db/schema";
import { CLOUD_AGENT_PROMPT_MAX_LENGTH } from "@superset/shared/cloud-agent-launch";
import { SUPERSET_USER_ID_HEADER } from "@superset/shared/host-routing";
import { and, eq } from "drizzle-orm";
import { acpChatEnabled } from "../../lib/acp-chat";
import { resolveMachineSize } from "../../lib/billing/plan";
import { cloudAccess } from "../../lib/cloud-guards";
import {
	environmentRepositoryRows,
	primaryRepository,
	SandboxUnavailableError,
	sandboxHostSecretFor,
} from "../../lib/sandbox";
import { startCloudWorkspace } from "../cloud-workspace/start";
import { transitionCloudWorkspace } from "../cloud-workspace/transition";
import {
	markSandboxUnavailable,
	wakeCloudWorkspace,
} from "../cloud-workspace/wake";
import type { DispatchableAutomation } from "./dispatch";
import { launchAgentSession } from "./hostSession";
import { hostServiceMutation, hostServiceQuery } from "./relay-client";
import {
	type AgentRunResult,
	nonForkPullRequest,
	type PreviousRunSession,
	previousRunSession,
	RunFailure,
	type RunWorkspace,
	replacePin,
} from "./run";

export const CLOUD_DISPATCH_DEADLINE_MS = 30_000;

const STRANDED_PROVISIONING_MS = 10 * 60_000;

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

type RunInCloudArgs = {
	automation: DispatchableAutomation;
	runId: string;
	prompt: string;
	event: {
		provider: string;
		repositoryId: string | null;
		payload: unknown;
	} | null;
	placed: (workspace: RunWorkspace | null) => void;
};

type Launch =
	| {
			kind: "pinned";
			row: CloudWorkspaceRow;
			hostTarget: string;
			headers: Record<string, string>;
			previous: PreviousRunSession | undefined;
	  }
	| { kind: "new"; environmentId: string; branch: string | undefined };

/**
 * Runs the agent in the pinned cloud workspace, woken and reached directly (a sandbox is never on
 * the relay). With no pin, or a pin that is gone, a new workspace starts and becomes the pin.
 */
export async function runInCloud(
	args: RunInCloudArgs,
): Promise<AgentRunResult | null> {
	// The deadline bounds getting ready; sending the agent or starting the box is never cut off.
	const launch = await withDeadline(prepareLaunch(args));
	const { automation, prompt, placed, runId } = args;

	if (launch.kind === "pinned") {
		// The sandbox's Codex is older than the codex-acp floor, so only Claude chats.
		const chat =
			automation.agent === "claude" &&
			(await acpChatEnabled(automation.ownerUserId));
		const target = { baseUrl: launch.hostTarget, headers: launch.headers };
		return launchAgentSession(
			{
				mutation: <TOutput>(procedure: string, input: object) =>
					hostServiceMutation<object, TOutput>(target, procedure, input),
				query: <TOutput>(procedure: string, input: object) =>
					hostServiceQuery<object, TOutput>(target, procedure, input),
			},
			{
				workspaceId: launch.row.id,
				agent: automation.agent,
				prompt,
				chat,
				previous: launch.previous,
			},
		);
	}

	const created = await startCloudWorkspace({
		organizationId: automation.organizationId,
		userId: automation.ownerUserId,
		environmentId: launch.environmentId,
		name: automation.name.slice(0, 200),
		branch: launch.branch,
		launch: { agent: automation.agent, prompt, automationRunId: runId },
		machineSize: (
			await resolveMachineSize(
				automation.organizationId,
				automation.machineSize,
			)
		)?.name,
		beforeProvision: async (workspaceId) => {
			placed({ cloudWorkspaceId: workspaceId });
			const bound = await db
				.update(automationRuns)
				.set({ cloudWorkspaceId: workspaceId })
				.where(
					and(
						eq(automationRuns.id, runId),
						eq(automationRuns.organizationId, automation.organizationId),
						eq(automationRuns.status, "dispatching"),
					),
				)
				.returning({ id: automationRuns.id });
			if (bound.length === 0)
				throw new RunFailure("automation run is no longer dispatching", null);
		},
	});
	placed({ cloudWorkspaceId: created.id });
	if (automation.cloudWorkspaceId) {
		await replacePin(
			automation.id,
			{ cloudWorkspaceId: automation.cloudWorkspaceId },
			created.id,
		);
	}
	return null;
}

function withDeadline<T>(work: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new RunFailure(
						`the cloud workspace should have started but did not answer within ${CLOUD_DISPATCH_DEADLINE_MS / 1000} seconds`,
						"cloud_not_ready",
					),
				),
			CLOUD_DISPATCH_DEADLINE_MS,
		);
	});
	return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

async function prepareLaunch({
	automation,
	prompt,
	event,
	placed,
}: RunInCloudArgs): Promise<Launch> {
	await assertOwnerMayUseCloud(automation);

	if (automation.cloudWorkspaceId) {
		placed({ cloudWorkspaceId: automation.cloudWorkspaceId });
	}
	const pinned = automation.cloudWorkspaceId
		? await reachablePin(automation.cloudWorkspaceId)
		: null;
	if (pinned) {
		const previous = automation.continueAgentSession
			? await previousRunSession(automation.id, {
					cloudWorkspaceId: pinned.row.id,
				})
			: undefined;
		const headers = {
			authorization: `Bearer ${await sandboxHostSecretFor(pinned.row.id)}`,
			[SUPERSET_USER_ID_HEADER]: automation.ownerUserId,
		};
		// Listing the agents adds the built-in ones. Without this, `agents.run` fails
		// on a box that never ran an agent.
		await fetch(`${pinned.hostTarget}/trpc/settings.agentConfigs.list`, {
			headers,
			signal: AbortSignal.timeout(10_000),
		});
		return { kind: "pinned", ...pinned, headers, previous };
	}

	placed(null);
	if (!automation.environmentId) {
		throw new RunFailure(
			"the automation has no environment to start a cloud workspace from",
			"cloud_environment_unusable",
		);
	}
	if (prompt.length > CLOUD_AGENT_PROMPT_MAX_LENGTH) {
		throw new RunFailure(
			`the prompt is ${prompt.length} characters; a new cloud workspace takes at most ${CLOUD_AGENT_PROMPT_MAX_LENGTH}`,
			null,
		);
	}
	return {
		kind: "new",
		environmentId: automation.environmentId,
		branch: event
			? await pullRequestBranch(event, automation.environmentId)
			: undefined,
	};
}

async function assertOwnerMayUseCloud(
	automation: DispatchableAutomation,
): Promise<void> {
	const [membership] = await db
		.select({ id: members.id })
		.from(members)
		.where(
			and(
				eq(members.userId, automation.ownerUserId),
				eq(members.organizationId, automation.organizationId),
			),
		)
		.limit(1);
	if (!membership) {
		throw new RunFailure(
			"the automation's owner is no longer a member of this organization",
			"cloud_access_denied",
		);
	}
	const { enabled } = await cloudAccess(
		{ userId: automation.ownerUserId, session: null },
		automation.organizationId,
	);
	if (enabled === undefined) {
		throw new RunFailure("could not check the owner's cloud access", null);
	}
	if (!enabled) {
		throw new RunFailure(
			"the automation's owner can no longer use cloud workspaces",
			"cloud_access_denied",
		);
	}
}

/** The pinned cloud workspace, awake, or null when it is gone. */
async function reachablePin(
	cloudWorkspaceId: string,
): Promise<{ row: CloudWorkspaceRow; hostTarget: string } | null> {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, cloudWorkspaceId),
	});
	if (!row || row.status === "deleted" || row.status === "failed") {
		return null;
	}
	if (row.status === "provisioning") {
		if (Date.now() - row.createdAt.getTime() > STRANDED_PROVISIONING_MS) {
			await transitionCloudWorkspace({
				id: row.id,
				from: ["provisioning"],
				to: "failed",
			});
			return null;
		}
		throw new RunFailure(
			"the pinned cloud workspace is still provisioning",
			"cloud_not_ready",
		);
	}
	try {
		const { hostTarget } = await wakeCloudWorkspace(row);
		return { row, hostTarget };
	} catch (error) {
		if (!(error instanceof SandboxUnavailableError)) throw error;
		await markSandboxUnavailable(row, error);
		return null;
	}
}

/** The event's pull request branch, only when the event is about the environment's primary repository. */
async function pullRequestBranch(
	event: { provider: string; repositoryId: string | null; payload: unknown },
	environmentId: string,
): Promise<string | undefined> {
	const pullRequest = nonForkPullRequest(event);
	if (!pullRequest?.headRef || event.repositoryId === null) return undefined;
	const environment = await db.query.environments.findFirst({
		where: eq(environments.id, environmentId),
		columns: { primaryRepositoryId: true },
	});
	const primary = primaryRepository(
		await environmentRepositoryRows(environmentId),
		environment?.primaryRepositoryId,
	);
	return primary?.repoId === event.repositoryId
		? pullRequest.headRef
		: undefined;
}

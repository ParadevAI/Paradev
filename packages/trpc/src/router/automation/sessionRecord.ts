import { dbWs } from "@superset/db/client";
import {
	automationRuns,
	automations,
	chatSessions,
	cloudWorkspaces,
} from "@superset/db/schema";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AgentRunResult, RunWorkspace } from "./run";

type Transaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

type RunSessionColumns = Partial<
	Pick<
		typeof automationRuns.$inferInsert,
		"sessionKind" | "chatSessionId" | "terminalSessionId"
	>
>;

const uuid = z.string().uuid();

/**
 * The run's session columns. No session leaves them alone, so a cloud box that
 * reports its launch before the run settles keeps what it reported. A chat
 * whose metadata row could not be linked is recorded by its terminal, which is
 * what every client opens a run by.
 */
export function runSessionColumns(
	session: AgentRunResult | null,
	chatLinked: boolean,
): RunSessionColumns {
	if (!session) return {};
	if (session.kind === "terminal") {
		return {
			sessionKind: "terminal",
			chatSessionId: null,
			terminalSessionId: session.sessionId,
		};
	}
	if (!chatLinked) {
		return {
			sessionKind: "terminal",
			chatSessionId: null,
			terminalSessionId: session.terminalId,
		};
	}
	return {
		sessionKind: "chat",
		chatSessionId: session.sessionId,
		terminalSessionId: session.terminalId,
	};
}

/**
 * Makes sure `chat_sessions` holds the host's session id, so the run's foreign
 * key can name it. False when the id is not a UUID or already belongs to
 * someone else: the run must never point at another person's chat.
 */
export async function linkChatSession(
	tx: Transaction,
	chat: {
		sessionId: string;
		organizationId: string;
		ownerUserId: string;
		v2WorkspaceId: string | null;
	},
): Promise<boolean> {
	if (!uuid.safeParse(chat.sessionId).success) return false;
	const [inserted] = await tx
		.insert(chatSessions)
		.values({
			id: chat.sessionId,
			organizationId: chat.organizationId,
			createdBy: chat.ownerUserId,
			v2WorkspaceId: chat.v2WorkspaceId,
		})
		.onConflictDoNothing()
		.returning({ id: chatSessions.id });
	if (inserted) return true;
	const [existing] = await tx
		.select({
			organizationId: chatSessions.organizationId,
			createdBy: chatSessions.createdBy,
		})
		.from(chatSessions)
		.where(eq(chatSessions.id, chat.sessionId))
		.limit(1);
	return (
		existing?.organizationId === chat.organizationId &&
		existing.createdBy === chat.ownerUserId
	);
}

/** Settles a run as dispatched with the session it started. */
export async function recordDispatchedRun(args: {
	runId: string;
	organizationId: string;
	ownerUserId: string;
	workspace: RunWorkspace | null;
	session: AgentRunResult | null;
}): Promise<void> {
	const { session, workspace } = args;
	await dbWs.transaction(async (tx) => {
		const [existing] = await tx
			.select({
				cloudWorkspaceId: automationRuns.cloudWorkspaceId,
				sessionKind: automationRuns.sessionKind,
			})
			.from(automationRuns)
			.where(eq(automationRuns.id, args.runId))
			.limit(1)
			.for("update");
		const chatLinked =
			session?.kind === "chat" && existing?.sessionKind == null
				? await linkChatSession(tx, {
						sessionId: session.sessionId,
						organizationId: args.organizationId,
						ownerUserId: args.ownerUserId,
						v2WorkspaceId:
							workspace && "v2WorkspaceId" in workspace
								? workspace.v2WorkspaceId
								: null,
					})
				: false;
		const incomingNamesCloudWorkspace =
			workspace !== null && "cloudWorkspaceId" in workspace;
		const keptCloudWorkspaceId =
			!incomingNamesCloudWorkspace && existing?.cloudWorkspaceId
				? { cloudWorkspaceId: existing.cloudWorkspaceId }
				: {};
		await tx
			.update(automationRuns)
			.set({
				status: "dispatched",
				...(existing?.sessionKind
					? {}
					: runSessionColumns(session, chatLinked)),
				...workspace,
				...keptCloudWorkspaceId,
				dispatchedAt: new Date(),
			})
			.where(eq(automationRuns.id, args.runId));
	});
}

export const reportCloudLaunchSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("chat"),
		sessionId: z.string().uuid(),
		terminalId: z.string().min(1),
		automationRunId: z.string().uuid(),
	}),
	z.object({
		kind: z.literal("terminal"),
		terminalId: z.string().min(1),
		automationRunId: z.string().uuid(),
	}),
]);

export type ReportCloudLaunchInput = z.infer<typeof reportCloudLaunchSchema>;

export type CloudLaunchBox = {
	workspaceId: string;
	organizationId: string;
	userId: string;
};

export type CloudLaunchRunRow = {
	organizationId: string;
	hostId: string | null;
	status: string;
	createdAt: Date;
	cloudWorkspaceId: string | null;
	sessionKind: "chat" | "terminal" | null;
	chatSessionId: string | null;
	terminalSessionId: string | null;
};

export type CloudLaunchWorkspaceRow = {
	id: string;
	organizationId: string;
	createdByUserId: string | null;
	createdAt: Date;
};

export type CloudLaunchDecision = { record: boolean; recorded: boolean };

export function decideCloudLaunchReport(args: {
	box: CloudLaunchBox;
	run: CloudLaunchRunRow | null;
	automationOwnerUserId: string | null;
	workspace: CloudLaunchWorkspaceRow | null;
	input: ReportCloudLaunchInput;
}): CloudLaunchDecision {
	const denied: CloudLaunchDecision = {
		record: false,
		recorded: false,
	};
	const { box, run, workspace, input } = args;
	if (!run || !workspace || !args.automationOwnerUserId) return denied;
	if (run.hostId !== CLOUD_HOST_ID) return denied;
	if (run.status !== "dispatching" && run.status !== "dispatched") {
		return denied;
	}
	if (
		run.organizationId !== box.organizationId ||
		workspace.id !== box.workspaceId ||
		workspace.organizationId !== box.organizationId ||
		workspace.createdByUserId !== box.userId ||
		args.automationOwnerUserId !== box.userId
	) {
		return denied;
	}

	if (
		run.cloudWorkspaceId !== box.workspaceId ||
		workspace.createdAt < run.createdAt
	)
		return denied;

	const sameReport =
		run.sessionKind !== null &&
		run.terminalSessionId === input.terminalId &&
		(input.kind === "chat"
			? run.sessionKind === "chat" && run.chatSessionId === input.sessionId
			: run.sessionKind === "terminal");
	if (run.sessionKind !== null && !sameReport) return denied;
	if (sameReport) {
		return { record: false, recorded: true };
	}
	return { record: true, recorded: false };
}

export async function recordCloudLaunch(
	box: CloudLaunchBox,
	input: ReportCloudLaunchInput,
): Promise<{ recorded: boolean }> {
	return dbWs.transaction(async (tx) => {
		const [run] = await tx
			.select({
				id: automationRuns.id,
				automationId: automationRuns.automationId,
				organizationId: automationRuns.organizationId,
				hostId: automationRuns.hostId,
				status: automationRuns.status,
				createdAt: automationRuns.createdAt,
				cloudWorkspaceId: automationRuns.cloudWorkspaceId,
				sessionKind: automationRuns.sessionKind,
				chatSessionId: automationRuns.chatSessionId,
				terminalSessionId: automationRuns.terminalSessionId,
			})
			.from(automationRuns)
			.where(eq(automationRuns.id, input.automationRunId))
			.limit(1)
			.for("update");
		const [workspace] = await tx
			.select({
				id: cloudWorkspaces.id,
				organizationId: cloudWorkspaces.organizationId,
				createdAt: cloudWorkspaces.createdAt,
				createdByUserId: cloudWorkspaces.createdByUserId,
			})
			.from(cloudWorkspaces)
			.where(eq(cloudWorkspaces.id, box.workspaceId))
			.limit(1);
		const [automation] = run
			? await tx
					.select({ ownerUserId: automations.ownerUserId })
					.from(automations)
					.where(
						and(
							eq(automations.id, run.automationId),
							eq(automations.organizationId, box.organizationId),
						),
					)
					.limit(1)
			: [];
		const decision = decideCloudLaunchReport({
			box,
			run: run ?? null,
			automationOwnerUserId: automation?.ownerUserId ?? null,
			workspace: workspace ?? null,
			input,
		});
		if (!run || !decision.record) {
			return { recorded: decision.recorded };
		}

		let recorded = decision.recorded;
		if (decision.record) {
			const session: AgentRunResult =
				input.kind === "chat"
					? {
							kind: "chat",
							sessionId: input.sessionId,
							terminalId: input.terminalId,
							label: "",
						}
					: { kind: "terminal", sessionId: input.terminalId, label: "" };
			const chatLinked =
				session.kind === "chat"
					? await linkChatSession(tx, {
							sessionId: session.sessionId,
							organizationId: box.organizationId,
							ownerUserId: box.userId,
							v2WorkspaceId: null,
						})
					: false;
			const updated = await tx
				.update(automationRuns)
				.set(runSessionColumns(session, chatLinked))
				.where(
					and(
						eq(automationRuns.id, run.id),
						isNull(automationRuns.sessionKind),
					),
				)
				.returning({ id: automationRuns.id });
			recorded = updated.length > 0;
		}
		return { recorded };
	});
}

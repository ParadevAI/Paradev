import { randomUUID } from "node:crypto";
import type { MachineSize } from "@superset/shared/billing";
import { environmentOpensRepository } from "@superset/shared/cloud-environments";
import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import { keepMoveAlive } from "@superset/shared/move-book";
import { TRPCError } from "@trpc/server";
import type { ApiClient } from "../../types";
import { carryOutChatMove } from "./utils/carryOutChatMove";
import type { RelayHostClient } from "./utils/createRelayHostClient";

export type MoveDestination =
	| { kind: "cloud"; environmentId: string; machineSize?: MachineSize }
	| { kind: "computer"; hostId: string };

/** What `teleport.prepareWorkspace` answers. */
export type PreparedWorkspace = {
	branch: string;
	chats: { chatSessionId: string }[];
};

type DestinationHost = Pick<
	RelayHostClient,
	"teleport" | "workspaces" | "workspace" | "workspaceCleanup"
>;

type Target =
	| Extract<MoveDestination, { kind: "cloud" }>
	| {
			kind: "computer";
			hostId: string;
			host: DestinationHost;
			projectId: string;
	  };

export type WorkspaceMoveDeps = {
	api: ApiClient;
	organizationId: string;
	fromHostId: string;
	/** The GitHub repository the workspace's work is pushed to, as `owner/name`. */
	repositoryOf: (workspaceId: string) => Promise<string>;
	prepare: (workspaceId: string) => Promise<PreparedWorkspace>;
	releaseChats: (chatSessionIds: string[]) => Promise<void>;
	destinationHost: (hostId: string) => Promise<DestinationHost>;
	heartbeatMs?: number;
	createPollMs?: number;
	createTimeoutMs?: number;
	newWorkspaceId?: () => string;
};

const CREATE_POLL_MS = 2_000;
// Sized for worktree adds on monorepo-scale repos, as the desktop's create waits.
const CREATE_TIMEOUT_MS = 10 * 60_000;

/**
 * Records a move of a workspace on this host, then carries it out in the
 * background: the work goes to one branch, a workspace starts from it at the
 * destination, and each chat moves on its own. Throws, with nothing changed,
 * when the destination cannot take the workspace. Returns once the move is
 * recorded; `done` settles when this host's part ends. Callers follow the
 * move through `workspaceMove.latest`.
 */
export async function beginWorkspaceMove(
	deps: WorkspaceMoveDeps,
	input: { workspaceId: string; name: string; destination: MoveDestination },
): Promise<{ workspaceMoveId: string; done: Promise<void> }> {
	const { destination } = input;
	const repository = await deps.repositoryOf(input.workspaceId);
	const target = await resolveTarget(deps, destination, repository);
	const { workspaceMoveId } = await deps.api.workspaceMove.begin.mutate({
		fromWorkspaceId: input.workspaceId,
		fromHostId: deps.fromHostId,
		...(destination.kind === "computer"
			? { toHostId: destination.hostId }
			: {}),
	});
	const done = carryOut(deps, { ...input, workspaceMoveId, target });
	done.catch((error: unknown) =>
		console.warn(`[workspace-move] move ${workspaceMoveId} failed`, error),
	);
	return { workspaceMoveId, done };
}

async function resolveTarget(
	deps: WorkspaceMoveDeps,
	destination: MoveDestination,
	repository: string,
): Promise<Target> {
	if (destination.kind === "cloud") {
		const environment = await deps.api.environment.get.query({
			id: destination.environmentId,
		});
		if (!environmentOpensRepository(environment, repository)) {
			throw cannotMove(`That cloud environment does not open ${repository}`);
		}
		return destination;
	}
	const host = await deps.destinationHost(destination.hostId);
	const { projectId } = await host.teleport.findProject
		.query({ repositoryFullName: repository })
		.catch((error: unknown) => {
			if (isMissingProcedureError(error)) {
				throw cannotMove(
					"Update Paradev on that computer to move workspaces to it",
				);
			}
			throw error;
		});
	if (!projectId) {
		throw cannotMove(`Add ${repository} as a project on that computer first`);
	}
	return { kind: "computer", hostId: destination.hostId, host, projectId };
}

function cannotMove(message: string): TRPCError {
	return new TRPCError({ code: "PRECONDITION_FAILED", message });
}

async function carryOut(
	deps: WorkspaceMoveDeps,
	input: {
		workspaceMoveId: string;
		workspaceId: string;
		name: string;
		target: Target;
	},
): Promise<void> {
	const { api, organizationId } = deps;
	const { workspaceMoveId, target } = input;
	const leaving: string[] = [];
	const moved = await keepMoveAlive({
		workspaceMoveId,
		intervalMs: deps.heartbeatMs,
		heartbeat: (id) =>
			api.workspaceMove.heartbeat.mutate({ workspaceMoveId: id }),
		work: async (signal) => {
			const prepared = await deps.prepare(input.workspaceId);
			const chatSessionIds = prepared.chats.map((chat) => chat.chatSessionId);
			leaving.push(...chatSessionIds);
			signal.throwIfAborted();
			if (target.kind === "cloud") {
				const created = await api.cloudWorkspace.create.mutate({
					organizationId,
					environmentId: target.environmentId,
					machineSize: target.machineSize,
					name: input.name,
					branch: prepared.branch,
					move: { workspaceMoveId, chatSessionIds },
				});
				return {
					refused: created.skippedChats.map((chat) => chat.chatSessionId),
					chatMoves: [],
					host: null,
				};
			}
			const { host, projectId } = target;
			await host.teleport.fetchBranch.mutate({
				projectId,
				branch: prepared.branch,
			});
			const toWorkspaceId = (deps.newWorkspaceId ?? randomUUID)();
			await host.workspaces.createEnqueued.mutate({
				id: toWorkspaceId,
				projectId,
				branch: prepared.branch,
				skipBranchPrefix: true,
				name: input.name,
			});
			await waitForWorkspace(host, toWorkspaceId, signal, deps);
			const attached = await api.workspaceMove.attach
				.mutate({
					workspaceMoveId,
					toWorkspaceId,
					branch: prepared.branch,
					chatSessionIds,
				})
				.catch(async (error: unknown) => {
					await host.workspaceCleanup.destroy
						.mutate({ workspaceId: toWorkspaceId, force: true })
						.catch((destroyError: unknown) =>
							console.warn(
								"[workspace-move] could not remove the unused destination workspace",
								destroyError,
							),
						);
					throw error;
				});
			return {
				refused: attached.skipped.map((chat) => chat.chatSessionId),
				chatMoves: attached.moves.map((move) => move.moveId),
				host,
			};
		},
	}).catch(async (error: unknown) => {
		await api.workspaceMove.abandon
			.mutate({ workspaceMoveId, error: abandonReason(error) })
			.catch((abandonError: unknown) =>
				console.warn(
					`[workspace-move] could not record that move ${workspaceMoveId} stopped`,
					abandonError,
				),
			);
		await deps.releaseChats(leaving);
		throw error;
	});
	await deps.releaseChats(moved.refused);
	const { host } = moved;
	if (!host) return;
	for (const moveId of moved.chatMoves) {
		await carryOutChatMove({ api, host, moveId }).catch((error: unknown) =>
			console.warn(`[workspace-move] chat move ${moveId} failed`, error),
		);
	}
}

async function waitForWorkspace(
	host: DestinationHost,
	workspaceId: string,
	signal: AbortSignal,
	deps: Pick<WorkspaceMoveDeps, "createPollMs" | "createTimeoutMs">,
): Promise<void> {
	const pollMs = deps.createPollMs ?? CREATE_POLL_MS;
	const deadline = Date.now() + (deps.createTimeoutMs ?? CREATE_TIMEOUT_MS);
	while (Date.now() < deadline) {
		signal.throwIfAborted();
		const found = await host.workspace.get
			.query({ id: workspaceId })
			.then(() => true)
			.catch((error: unknown) => {
				if (codeOf(error) === "NOT_FOUND") return false;
				throw error;
			});
		if (found) return;
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
	throw new Error("Timed out waiting for the computer to create the workspace");
}

function abandonReason(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.slice(0, 2000) || "The move could not start";
}

function codeOf(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("data" in error)) {
		return undefined;
	}
	return (error as { data?: { code?: string } }).data?.code;
}

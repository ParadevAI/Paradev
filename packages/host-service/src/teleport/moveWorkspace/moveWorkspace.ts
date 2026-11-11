import { randomUUID } from "node:crypto";
import type { MachineSize } from "@superset/shared/billing";
import { keepMoveAlive } from "@superset/shared/move-book";
import type { ApiClient } from "../../types";
import { carryOutChatMove } from "./utils/carryOutChatMove";
import type { RelayHostClient } from "./utils/createRelayHostClient";

export type MoveDestination =
	| { kind: "cloud"; environmentId: string; machineSize?: MachineSize }
	| { kind: "computer"; hostId: string };

/** What `teleport.prepareWorkspace` answers. */
export type PreparedWorkspace = {
	branch: string;
	repositoryFullName: string;
	chats: { chatSessionId: string }[];
};

type DestinationHost = Pick<
	RelayHostClient,
	"project" | "teleport" | "workspaces" | "workspace" | "workspaceCleanup"
>;

export type WorkspaceMoveDeps = {
	api: ApiClient;
	organizationId: string;
	fromHostId: string;
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
 * destination, and each chat moves on its own. Returns once the move is
 * recorded; `done` settles when this host's part ends. Callers follow the
 * move through `workspaceMove.latest`.
 */
export async function beginWorkspaceMove(
	deps: WorkspaceMoveDeps,
	input: { workspaceId: string; name: string; destination: MoveDestination },
): Promise<{ workspaceMoveId: string; done: Promise<void> }> {
	const { destination } = input;
	const { workspaceMoveId } = await deps.api.workspaceMove.begin.mutate({
		fromWorkspaceId: input.workspaceId,
		fromHostId: deps.fromHostId,
		...(destination.kind === "computer"
			? { toHostId: destination.hostId }
			: {}),
	});
	const done = carryOut(deps, { ...input, workspaceMoveId });
	done.catch((error: unknown) =>
		console.warn(`[workspace-move] move ${workspaceMoveId} failed`, error),
	);
	return { workspaceMoveId, done };
}

async function carryOut(
	deps: WorkspaceMoveDeps,
	input: {
		workspaceMoveId: string;
		workspaceId: string;
		name: string;
		destination: MoveDestination;
	},
): Promise<void> {
	const { api, organizationId } = deps;
	const { workspaceMoveId, destination } = input;
	const leaving: string[] = [];
	const moved = await keepMoveAlive({
		workspaceMoveId,
		intervalMs: deps.heartbeatMs,
		heartbeat: (id) =>
			api.workspaceMove.heartbeat.mutate({ workspaceMoveId: id }),
		work: async (signal) => {
			const environment =
				destination.kind === "cloud"
					? await api.environment.get.query({ id: destination.environmentId })
					: null;
			const prepared = await deps.prepare(input.workspaceId);
			const chatSessionIds = prepared.chats.map((chat) => chat.chatSessionId);
			leaving.push(...chatSessionIds);
			signal.throwIfAborted();
			if (destination.kind === "cloud") {
				assertEnvironmentOpens(environment, prepared.repositoryFullName);
				const created = await api.cloudWorkspace.create.mutate({
					organizationId,
					environmentId: destination.environmentId,
					machineSize: destination.machineSize,
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
			const host = await deps.destinationHost(destination.hostId);
			const project = await findProject(host, prepared.repositoryFullName);
			await host.teleport.fetchBranch.mutate({
				projectId: project.id,
				branch: prepared.branch,
			});
			const toWorkspaceId = (deps.newWorkspaceId ?? randomUUID)();
			await host.workspaces.createEnqueued.mutate({
				id: toWorkspaceId,
				projectId: project.id,
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

function assertEnvironmentOpens(
	environment: { repositories: { fullName: string }[] } | null,
	repositoryFullName: string,
): void {
	const repository = repositoryFullName.toLowerCase();
	if (
		environment?.repositories.some(
			(repo) => repo.fullName.toLowerCase() === repository,
		)
	) {
		return;
	}
	throw new Error(`That cloud environment does not open ${repositoryFullName}`);
}

async function findProject(host: DestinationHost, repositoryFullName: string) {
	const repository = repositoryFullName.toLowerCase();
	const projects = await host.project.list.query();
	const project = projects.find(
		(row) => `${row.repoOwner}/${row.repoName}`.toLowerCase() === repository,
	);
	if (!project) {
		throw new Error(
			`Add ${repositoryFullName} as a project on that computer first`,
		);
	}
	return project;
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

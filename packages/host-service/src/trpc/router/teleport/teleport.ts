import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { sessionSelections } from "@superset/chat/core";
import type { DurableEvent } from "@superset/chat/protocol";
import type { ChatRuntime } from "@superset/chat-runtime";
import { MACHINE_SIZES } from "@superset/shared/billing";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { projects, workspaces } from "../../../db/schema";
import { createGitEnvResolver } from "../../../runtime/git";
import {
	downloadBundle,
	uploadBundle,
	withStage,
} from "../../../teleport/bundle";
import {
	beginWorkspaceMove,
	createRelayHostClient,
} from "../../../teleport/moveWorkspace";
import {
	type BundleManifest,
	isPlainSessionId,
	teleportProviderFor,
} from "../../../teleport/providers";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	gitPushSnapshotTask,
	gitSnapshotRemoteTask,
} from "../../../workers/tasks/git";
import {
	harnessPlaceSessionTask,
	harnessSessionFileTask,
} from "../../../workers/tasks/harness";
import {
	createCallerFactory,
	machineOnlyProcedure,
	protectedProcedure,
	router,
} from "../../index";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import { resolveWorktreePath } from "../git/utils/resolve-worktree";
import { requireChatRuntime } from "../sessions/session-service";
import { resolveDefaultAccountTerminalEnv } from "../usage/default-account";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../workspace-creation/shared/local-project";
import { resolveGithubRepo } from "../workspace-creation/shared/project-helpers";
import {
	importTerminalSession,
	listMovableTerminals,
	type MovedTerminal,
	packStoppedTerminal,
	resumeStoppedTerminals,
	type SkippedTerminal,
	type StopState,
	stopTerminalsForMove,
} from "./terminal-sessions";

const execFileAsync = promisify(execFile);
const BUSY_STATUSES = new Set(["starting", "running", "awaiting_input"]);
const STOP_TIMEOUT_MS = 20_000;
const STOP_POLL_MS = 200;
/** As many chats as `workspaceMove.attach` takes in one workspace move. */
const MAX_MOVED_CHATS = 50;
/** The most `listSessions` returns at once. */
const MAX_LISTED_CHATS = 200;

type MovableChat = {
	sessionId: string;
	harness: string;
	harnessSessionId: string;
	title: string | null;
	provider: NonNullable<ReturnType<typeof teleportProviderFor>>;
};

type PreparedChat = {
	chatSessionId: string;
	harnessSessionId: string;
	title: string | null;
};

type SkippedChat = {
	chatSessionId: string;
	title: string | null;
	reason:
		| "unsupported_agent"
		| "not_started"
		| "moved_away"
		| "failed"
		| "too_many";
};

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("data" in error)) {
		return undefined;
	}
	return (error as { data?: { code?: string } }).data?.code;
}

function requireChat(
	chat: ChatRuntime,
	workspaceId: string,
	sessionId: string,
) {
	const { session } = chat.commands.getSession({ sessionId });
	if (!session || session.scopeId !== workspaceId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "This chat is not in this workspace",
		});
	}
	return session;
}

function busyError() {
	return new TRPCError({
		code: "PRECONDITION_FAILED",
		message: "Wait for the agent to finish, or stop it, before moving",
	});
}

/** The remote a workspace's work is pushed to when it moves, and its GitHub repository. */
async function resolveSnapshotTarget(
	ctx: Parameters<typeof resolveWorktreePath>[0],
	workspaceId: string,
) {
	const worktreePath = resolveWorktreePath(ctx, workspaceId);
	const gitEnv = await createGitEnvResolver(ctx.credentials)(worktreePath);
	const target = await getHostWorkerPool()
		.run(gitSnapshotRemoteTask, { worktreePath, gitEnv })
		.catch((error: unknown) => {
			rethrowEnvironmentalGitError(error);
			throw error;
		});
	const repositories = (target?.pushUrls ?? []).map(parseGitHubRemote);
	const repository = repositories[0];
	if (!target || !repository || repositories.some((repo) => !repo)) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Moving a workspace needs a GitHub repository",
		});
	}
	return { worktreePath, gitEnv, target, repository };
}

/** The bundle's manifest with the chat's mode and model, which its history does not carry. */
function withSelections(
	manifest: BundleManifest,
	chat: ChatRuntime,
	sessionId: string,
): BundleManifest {
	const outline = chat.commands.getOutline({ sessionId });
	const { modeId, modelId } = outline.ok
		? sessionSelections(outline.outline.session)
		: {};
	if (!modeId && !modelId) return manifest;
	return {
		...manifest,
		selections: {
			...(modeId ? { modeId } : {}),
			...(modelId ? { modelId } : {}),
		},
	};
}

/** Cancels the running turn and waits until the chat is idle. */
async function stopRunningTurn(chat: ChatRuntime, sessionId: string) {
	const outline = chat.commands.getOutline({ sessionId });
	const running = outline.ok
		? outline.outline.turns.find((turn) => turn.status === "running")
		: undefined;
	if (running) {
		chat.commands.cancelTurn({
			commandId: randomUUID(),
			sessionId,
			turnId: running.id,
		});
	}
	const deadline = Date.now() + STOP_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const status = chat.commands.getSession({ sessionId }).session?.status;
		if (!status || !BUSY_STATUSES.has(status)) return;
		await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS));
	}
	throw new TRPCError({
		code: "TIMEOUT",
		message: "The agent did not stop in time; try again",
	});
}

export const teleportRouter = router({
	/**
	 * Gets a workspace ready to continue on another host: the worktree,
	 * uncommitted work included, goes to one new branch, and each chat's
	 * history and its agent's session files to the cloud. With `moveTerminals`,
	 * each terminal agent that can move is stopped and its session files
	 * uploaded too; a caller that does not ask never has a terminal stopped,
	 * since it could not hand it off. The caller starts the other side from
	 * all of them. A chat that cannot move is returned in `skipped` and stays
	 * here; a terminal, in `skippedTerminals`.
	 */
	prepareWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				stopIfBusy: z.boolean().optional(),
				moveTerminals: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const chat = requireChatRuntime(ctx);
			const chatSync = ctx.runtime.chatSync;
			if (!chatSync) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Chat sync is not available on this host",
				});
			}
			const sessions = chat.commands
				.listSessions({ scopeId: input.workspaceId, limit: MAX_LISTED_CHATS })
				// A chat closed here is gone for the person; moving it would open it again.
				.filter((session) => !session.closedAt);
			const skipped: SkippedChat[] = [];
			const movable: MovableChat[] = [];
			for (const [index, session] of sessions.entries()) {
				if (index >= MAX_MOVED_CHATS) {
					skipped.push({
						chatSessionId: session.sessionId,
						title: session.title,
						reason: "too_many",
					});
					continue;
				}
				const provider = teleportProviderFor(session.harness);
				if (!provider || !session.harnessSessionId) {
					skipped.push({
						chatSessionId: session.sessionId,
						title: session.title,
						reason: provider ? "not_started" : "unsupported_agent",
					});
					continue;
				}
				movable.push({
					sessionId: session.sessionId,
					harness: session.harness,
					harnessSessionId: session.harnessSessionId,
					title: session.title,
					provider,
				});
			}
			const busy = () =>
				movable.filter(({ sessionId }) =>
					BUSY_STATUSES.has(
						requireChat(chat, input.workspaceId, sessionId).status,
					),
				);
			const { movable: terminals, overflow } = input.moveTerminals
				? listMovableTerminals(ctx, input.workspaceId)
				: { movable: [], overflow: [] };
			const anyBusy =
				busy().length > 0 || terminals.some((terminal) => terminal.busy);
			if (anyBusy && !input.stopIfBusy) throw busyError();

			const env = resolveDefaultAccountTerminalEnv(ctx.db);
			const pool = getHostWorkerPool();
			const { worktreePath, gitEnv, target, repository } =
				await resolveSnapshotTarget(ctx, input.workspaceId);

			for (const { sessionId } of busy()) {
				await stopRunningTurn(chat, sessionId);
			}
			const assertIdle = () => {
				if (busy().length > 0) throw busyError();
			};
			assertIdle();

			const stopState: StopState = {
				stopped: [],
				skipped: overflow.map(
					(terminal): SkippedTerminal => ({
						terminalId: terminal.terminalId,
						title: terminal.title,
						reason: "too_many",
					}),
				),
			};
			const skippedTerminals = stopState.skipped;
			const movedTerminals: MovedTerminal[] = [];
			const branch = `superset/teleport-${randomUUID().slice(0, 8)}`;
			const prepared: PreparedChat[] = [];
			const followed: string[] = [];
			let firstFailure: unknown = null;
			try {
				await stopTerminalsForMove(ctx, terminals, stopState);
				await pool
					.run(
						gitPushSnapshotTask,
						{ worktreePath, remote: target.remote, branch, gitEnv },
						{ timeoutMs: 150_000 },
					)
					.catch((error: unknown) => {
						rethrowEnvironmentalGitError(error);
						throw error;
					});

				for (const { terminal, sessionFile } of stopState.stopped) {
					try {
						movedTerminals.push(
							await packStoppedTerminal(ctx, {
								terminal,
								sessionFile,
								worktreePath,
							}),
						);
					} catch (error) {
						console.warn(
							`[teleport] could not pack terminal ${terminal.terminalId}; it stays here`,
							error,
						);
						const restart = await resumeStoppedTerminals(
							ctx,
							input.workspaceId,
							[terminal.terminalId],
						);
						skippedTerminals.push({
							terminalId: terminal.terminalId,
							title: terminal.title,
							reason: "failed",
							...(restart.failed.length > 0 ? { stopped: true } : {}),
						});
					}
				}

				assertIdle();
				for (const session of movable) {
					try {
						await chatSync.syncSession(session.sessionId);
					} catch (error) {
						if (errorCode(error) !== "CONFLICT") throw error;
						skipped.push({
							chatSessionId: session.sessionId,
							title: session.title,
							reason: "moved_away",
						});
						continue;
					}
					chatSync.follow(session.sessionId);
					followed.push(session.sessionId);
					const outcome = await withStage(async (stageDir) => {
						const manifest = await session.provider.collect({
							harnessSessionId: session.harnessSessionId,
							worktreePath,
							env,
							stageDir,
							locate: () =>
								pool.run(harnessSessionFileTask, {
									ref: {
										agentId: "claude",
										sessionId: session.harnessSessionId,
										worktreePath,
										env,
									},
								}),
						});
						if (!manifest) return "not_started" as const;
						await uploadBundle({
							api: ctx.api,
							chatSessionId: session.sessionId,
							harness: session.harness,
							manifest: withSelections(manifest, chat, session.sessionId),
							stageDir,
						});
						return "uploaded" as const;
					}).catch((error: unknown) => {
						console.warn(
							`[teleport] could not pack chat ${session.sessionId}; it stays here`,
							error,
						);
						firstFailure ??= error;
						return "failed" as const;
					});
					if (outcome !== "uploaded") {
						chatSync.forget(session.sessionId);
						followed.pop();
						skipped.push({
							chatSessionId: session.sessionId,
							title: session.title,
							reason: outcome,
						});
						continue;
					}
					prepared.push({
						chatSessionId: session.sessionId,
						harnessSessionId: session.harnessSessionId,
						title: session.title,
					});
				}
				// Every chat failing is the move failing (an upload outage, say), not a choice to leave them.
				if (prepared.length === 0 && firstFailure) throw firstFailure;
			} catch (error) {
				for (const sessionId of followed) chatSync.forget(sessionId);
				await resumeStoppedTerminals(
					ctx,
					input.workspaceId,
					stopState.stopped.map(({ terminal }) => terminal.terminalId),
				).catch((resumeError: unknown) =>
					console.warn(
						"[teleport] could not restart terminals after a failed prepare",
						resumeError,
					),
				);
				throw error;
			}

			return {
				branch,
				repositoryFullName: `${repository.owner}/${repository.name}`,
				chats: prepared,
				skipped,
				terminals: movedTerminals,
				skippedTerminals,
			};
		}),

	/**
	 * Moves a workspace on this computer to the cloud or to another of the
	 * person's computers, and carries the move out here, so the client that
	 * asked (a phone, say) need not stay open. Answers once the move is
	 * recorded; `workspaceMove.latest` follows it from there.
	 */
	moveWorkspace: machineOnlyProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				/** What the destination workspace is called; defaults to this one's name. */
				name: z.string().min(1).max(200).optional(),
				destination: z.discriminatedUnion("kind", [
					z.object({
						kind: z.literal("cloud"),
						environmentId: z.string().uuid(),
						machineSize: z.enum(MACHINE_SIZES).optional(),
					}),
					z.object({
						kind: z.literal("computer"),
						hostId: z.string().min(1).max(200),
					}),
				]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			const fromHostId = getHostId();
			const { destination } = input;
			if (
				destination.kind === "computer" &&
				destination.hostId === fromHostId
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "The workspace is already on this computer",
				});
			}
			const auth = ctx.apiAuth;
			if (destination.kind === "computer" && !auth) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This computer cannot reach your other computers",
				});
			}
			if (movesInFlight.has(input.workspaceId)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This workspace is already moving",
				});
			}
			movesInFlight.add(input.workspaceId);
			const teleport = createTeleportCaller(ctx);
			try {
				const { workspaceMoveId, done } = await beginWorkspaceMove(
					{
						api: ctx.api,
						organizationId: ctx.organizationId,
						fromHostId,
						repositoryOf: async (workspaceId) => {
							const { repository } = await resolveSnapshotTarget(
								ctx,
								workspaceId,
							);
							return `${repository.owner}/${repository.name}`;
						},
						prepare: (workspaceId) =>
							teleport.prepareWorkspace({ workspaceId, stopIfBusy: true }),
						releaseChats: async (chatSessionIds) => {
							if (chatSessionIds.length === 0) return;
							await teleport.releaseChats({ chatSessionIds });
						},
						destinationHost: async (hostId) => {
							const endpoint = await ctx.api.host.relayEndpoint.query();
							if (!endpoint?.url || !auth) {
								throw new Error("This computer cannot reach the relay");
							}
							return createRelayHostClient({
								relayUrl: endpoint.url,
								organizationId: ctx.organizationId,
								hostId,
								auth,
							});
						},
					},
					{
						workspaceId: input.workspaceId,
						name: input.name ?? (workspace.name || workspace.branch),
						destination,
					},
				);
				void done
					.catch(() => {})
					.finally(() => movesInFlight.delete(input.workspaceId));
				return { workspaceMoveId };
			} catch (error) {
				movesInFlight.delete(input.workspaceId);
				throw error;
			}
		}),

	/** The move of these chats failed or was abandoned: they stay here and stop being pushed for it. */
	releaseChats: protectedProcedure
		.input(
			z.object({
				chatSessionIds: z.array(z.string().uuid()).max(200),
			}),
		)
		.mutation(({ ctx, input }) => {
			for (const sessionId of input.chatSessionIds) {
				ctx.runtime.chatSync?.forget(sessionId);
			}
			return { ok: true };
		}),

	/** The move of these terminals failed or was abandoned: their agents start here again. */
	releaseTerminals: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				terminalIds: z.array(z.string().min(1)).max(200),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { resumed, failed } = await resumeStoppedTerminals(
				ctx,
				input.workspaceId,
				input.terminalIds,
			);
			return { resumedTerminalIds: resumed, failedTerminalIds: failed };
		}),

	/**
	 * Brings in a terminal agent's session moving here from another host and
	 * starts the agent on it in a new terminal, which the desktop opens as a
	 * pane when it shows the workspace.
	 */
	importTerminalSession: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				agent: z.string().min(1).max(200),
				agentId: z.string().min(1).max(100),
				harnessSessionId: z.string().refine(isPlainSessionId),
				bundle: z.object({
					url: z.string().url(),
					sha256: z.string().min(1),
					byteLength: z.number().int().nonnegative(),
				}),
			}),
		)
		.mutation(({ ctx, input }) =>
			importTerminalSession(ctx, {
				...input,
				worktreePath: resolveWorktreePath(ctx, input.workspaceId),
			}),
		),

	/** Stops the copy left behind and says in it where the chat went. */
	markMoved: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				chatSessionId: z.string().uuid(),
				destination: z.enum(["cloud", "computer"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const chat = requireChatRuntime(ctx);
			requireChat(chat, input.workspaceId, input.chatSessionId);
			await chat.commands.closeSession({ sessionId: input.chatSessionId });
			chat.journal.append(input.chatSessionId, {
				type: "item",
				turnId: `moved-${randomUUID()}`,
				item: {
					id: `moved-${randomUUID()}`,
					kind: "notice",
					noticeKind: "info",
					text:
						input.destination === "cloud"
							? "This chat moved to a cloud workspace and continues there."
							: "This chat moved to a computer and continues there.",
					startedAtMs: Date.now(),
				},
			});
			return { ok: true };
		}),

	/** The project here whose live GitHub remote is `repositoryFullName`, for a workspace moving in. */
	findProject: machineOnlyProcedure
		.input(z.object({ repositoryFullName: z.string().min(3).max(300) }))
		.query(async ({ ctx, input }) => {
			const wanted = input.repositoryFullName.toLowerCase();
			const rows = ctx.db
				.select({ id: projects.id })
				.from(projects)
				.where(isNull(projects.deletedAt))
				.all();
			for (const { id } of rows) {
				const repo = await resolveGithubRepo(ctx, id).catch(() => null);
				if (repo && `${repo.owner}/${repo.name}`.toLowerCase() === wanted) {
					return { projectId: id };
				}
			}
			return { projectId: null };
		}),

	/** Makes a branch another host pushed available to create a worktree from. */
	fetchBranch: machineOnlyProcedure
		.input(z.object({ projectId: z.string(), branch: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const repoPath = requireProjectRepoPath(
				requireLocalProject(ctx, input.projectId),
			);
			const gitEnv = await createGitEnvResolver(ctx.credentials)(repoPath);
			await execFileAsync(
				"git",
				[
					"-C",
					repoPath,
					"fetch",
					"origin",
					`+refs/heads/${input.branch}:refs/remotes/origin/${input.branch}`,
				],
				{ env: { ...process.env, ...gitEnv } },
			).catch((error: unknown) => {
				rethrowEnvironmentalGitError(error);
				throw error;
			});
			return { branch: input.branch };
		}),

	/**
	 * Brings in a chat moving here from another host, under its own id: its
	 * history replaces whatever this host had of it, and its agent's session
	 * files go where the agent looks. The control plane calls this with
	 * everything the chat needs; `continueChat` then starts it.
	 */
	importChat: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				chatSessionId: z.string().uuid(),
				session: z.object({
					harness: z.string().min(1),
					harnessSessionId: z.string().min(1),
					title: z.string().nullable(),
					epoch: z.string().min(1),
					lastSeq: z.number().int().nonnegative(),
				}),
				events: z.array(
					z.object({ seq: z.number().int().positive(), event: z.unknown() }),
				),
				bundle: z.object({
					url: z.string().url(),
					sha256: z.string().min(1),
					byteLength: z.number().int().nonnegative(),
				}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const chat = requireChatRuntime(ctx);
			const provider = teleportProviderFor(input.session.harness);
			if (!provider) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This host cannot continue the moved chat's agent",
				});
			}
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const selections = await withStage(async (stageDir) => {
				const manifest = await downloadBundle({
					bundle: {
						...input.bundle,
						harnessSessionId: input.session.harnessSessionId,
					},
					stageDir,
				});
				await getHostWorkerPool().run(
					harnessPlaceSessionTask,
					{
						harness: input.session.harness,
						manifest,
						worktreePath,
						env: resolveDefaultAccountTerminalEnv(ctx.db),
						stageDir,
					},
					{ timeoutMs: 120_000 },
				);
				return manifest.selections;
			});
			if (chat.live.get(input.chatSessionId)) {
				await chat.commands.closeSession({ sessionId: input.chatSessionId });
			}
			chat.journal.importSession({
				session: {
					sessionId: input.chatSessionId,
					scopeId: input.workspaceId,
					harness: input.session.harness,
					harnessSessionId: input.session.harnessSessionId,
					title: input.session.title ?? undefined,
					status: "idle",
					lastSeq: input.session.lastSeq,
				},
				events: input.events as { seq: number; event: DurableEvent }[],
				replace: true,
			});
			if (selections) {
				const outline = chat.commands.getOutline({
					sessionId: input.chatSessionId,
				});
				// A session event replaces the whole state, so it carries what the history set.
				chat.journal.append(input.chatSessionId, {
					type: "session",
					session: {
						...(outline.ok ? outline.outline.session : null),
						status: "idle",
						harness: input.session.harness,
						...selections,
					},
				});
			}
			ctx.runtime.chatSync?.forget(input.chatSessionId);
			return { sessionId: input.chatSessionId };
		}),

	/** Starts an imported chat's agent again without replaying its history. */
	continueChat: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				chatSessionId: z.string().uuid(),
				harnessSessionId: z.string().min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			const chat = requireChatRuntime(ctx);
			requireChat(chat, input.workspaceId, input.chatSessionId);
			chat.commands.continueSession({
				sessionId: input.chatSessionId,
				cwd: resolveWorktreePath(ctx, input.workspaceId),
				harnessSessionId: input.harnessSessionId,
				terminalId: input.chatSessionId,
			});
			return {
				sessionId: input.chatSessionId,
				terminalId:
					chat.live.get(input.chatSessionId)?.terminalId ?? input.chatSessionId,
			};
		}),
});

/** Workspaces whose move this host is carrying out. */
const movesInFlight = new Set<string>();

// Declared after the router; the procedures dereference it only at request time.
const createTeleportCaller = createCallerFactory(teleportRouter);

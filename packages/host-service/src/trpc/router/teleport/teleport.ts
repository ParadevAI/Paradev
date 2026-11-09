import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { DurableEvent } from "@superset/chat/protocol";
import type { ChatRuntime } from "@superset/chat-runtime";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createGitEnvResolver } from "../../../runtime/git";
import {
	downloadBundle,
	uploadBundle,
	withStage,
} from "../../../teleport/bundle";
import { teleportProviderFor } from "../../../teleport/providers";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	gitPushSnapshotTask,
	gitSnapshotRemoteTask,
} from "../../../workers/tasks/git";
import {
	harnessPlaceSessionTask,
	harnessSessionFileTask,
} from "../../../workers/tasks/harness";
import { machineOnlyProcedure, protectedProcedure, router } from "../../index";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import { resolveWorktreePath } from "../git/utils/resolve-worktree";
import { requireChatRuntime } from "../sessions/session-service";
import { resolveDefaultAccountTerminalEnv } from "../usage/default-account";
import {
	requireLocalProject,
	requireProjectRepoPath,
} from "../workspace-creation/shared/local-project";

const execFileAsync = promisify(execFile);
const BUSY_STATUSES = new Set(["starting", "running", "awaiting_input"]);
const STOP_TIMEOUT_MS = 20_000;
const STOP_POLL_MS = 200;
/** As many chats as `workspaceMove.start` takes in one workspace move. */
const MAX_MOVED_CHATS = 50;

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
	reason: "unsupported_agent" | "not_started" | "moved_away";
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
	 * history and its agent's session files to the cloud. The caller starts
	 * the other side from all of them. A chat that cannot move is returned in
	 * `skipped` and stays here.
	 */
	prepareWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				stopIfBusy: z.boolean().optional(),
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
			const sessions = chat.commands.listSessions({
				scopeId: input.workspaceId,
				limit: MAX_MOVED_CHATS,
			});
			const skipped: SkippedChat[] = [];
			const movable: MovableChat[] = [];
			for (const session of sessions) {
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
			if (busy().length > 0 && !input.stopIfBusy) throw busyError();

			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const env = resolveDefaultAccountTerminalEnv(ctx.db);
			const pool = getHostWorkerPool();
			const gitEnv = await createGitEnvResolver(ctx.credentials)(worktreePath);
			const target = await pool
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

			for (const { sessionId } of busy()) {
				await stopRunningTurn(chat, sessionId);
			}
			const assertIdle = () => {
				if (busy().length > 0) throw busyError();
			};
			assertIdle();

			const branch = `superset/teleport-${randomUUID().slice(0, 8)}`;
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

			assertIdle();
			const prepared: PreparedChat[] = [];
			const followed: string[] = [];
			try {
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
					await withStage(async (stageDir) => {
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
						await uploadBundle({
							api: ctx.api,
							chatSessionId: session.sessionId,
							harness: session.harness,
							manifest,
							stageDir,
						});
					});
					prepared.push({
						chatSessionId: session.sessionId,
						harnessSessionId: session.harnessSessionId,
						title: session.title,
					});
				}
			} catch (error) {
				for (const sessionId of followed) chatSync.forget(sessionId);
				throw error;
			}

			return {
				branch,
				repositoryFullName: `${repository.owner}/${repository.name}`,
				chats: prepared,
				skipped,
			};
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
			await withStage(async (stageDir) => {
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

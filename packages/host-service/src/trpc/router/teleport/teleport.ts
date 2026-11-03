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
	 * Gets a chat ready to continue on another host: the worktree, uncommitted
	 * work included, goes to a new branch, and the chat's history and its
	 * agent's session files to the cloud. The caller starts the other side
	 * from all three.
	 */
	prepare: protectedProcedure
		.meta({ timeoutMs: 180_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				chatSessionId: z.string().uuid(),
				stopIfBusy: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const chat = requireChatRuntime(ctx);
			const session = requireChat(chat, input.workspaceId, input.chatSessionId);
			const provider = teleportProviderFor(session.harness);
			const harnessSessionId = session.harnessSessionId;
			if (!provider || !harnessSessionId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "This chat's agent cannot move yet",
				});
			}
			const chatSync = ctx.runtime.chatSync;
			if (!chatSync) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Chat sync is not available on this host",
				});
			}
			if (BUSY_STATUSES.has(session.status) && !input.stopIfBusy) {
				throw busyError();
			}

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
					message: "Moving a chat needs a GitHub repository",
				});
			}

			if (input.stopIfBusy) {
				await stopRunningTurn(chat, input.chatSessionId);
			}
			const assertIdle = () => {
				const { status } = requireChat(
					chat,
					input.workspaceId,
					input.chatSessionId,
				);
				if (BUSY_STATUSES.has(status)) throw busyError();
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
			await chatSync.syncSession(input.chatSessionId);
			chatSync.follow(input.chatSessionId);
			await withStage(async (stageDir) => {
				const manifest = await provider.collect({
					harnessSessionId,
					worktreePath,
					env,
					stageDir,
					locate: () =>
						pool.run(harnessSessionFileTask, {
							ref: {
								agentId: "claude",
								sessionId: harnessSessionId,
								worktreePath,
								env,
							},
						}),
				});
				await uploadBundle({
					api: ctx.api,
					chatSessionId: input.chatSessionId,
					harness: session.harness,
					manifest,
					stageDir,
				});
			});

			return {
				branch,
				repositoryFullName: `${repository.owner}/${repository.name}`,
				harnessSessionId,
				title: session.title,
			};
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
			if (chat.live.get(input.chatSessionId)) {
				await chat.commands.closeSession({ sessionId: input.chatSessionId });
			}
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
		.meta({ timeoutMs: 120_000 })
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
		.meta({ timeoutMs: 180_000 })
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

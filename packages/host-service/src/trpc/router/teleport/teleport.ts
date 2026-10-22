import { randomUUID } from "node:crypto";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createGitEnvResolver } from "../../../runtime/git";
import { uploadSessionFile } from "../../../teleport/upload-session-file";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import { gitPushSnapshotTask } from "../../../workers/tasks/git";
import { harnessSessionFileTask } from "../../../workers/tasks/harness";
import { protectedProcedure, router } from "../../index";
import { rethrowEnvironmentalGitError } from "../git/utils/classify-git-error";
import { resolveWorktreePath } from "../git/utils/resolve-worktree";
import { resolveDefaultAccountTerminalEnv } from "../usage/default-account";

export const teleportRouter = router({
	/**
	 * Gets a Claude chat ready to continue in a cloud workspace: pushes the
	 * worktree, uncommitted work included, to a new branch and uploads the
	 * session file. The client creates the cloud workspace from both.
	 */
	prepareClaudeSession: protectedProcedure
		.meta({ timeoutMs: 180_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				harnessSessionId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const pool = getHostWorkerPool();
			const sessionFile = await pool.run(harnessSessionFileTask, {
				ref: {
					agentId: "claude",
					sessionId: input.harnessSessionId,
					worktreePath,
					env: resolveDefaultAccountTerminalEnv(ctx.db),
				},
			});
			if (!sessionFile) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Could not find this conversation's Claude session file",
				});
			}

			const branch = `superset/teleport-${randomUUID().slice(0, 8)}`;
			const gitEnv = await createGitEnvResolver(ctx.credentials)(worktreePath);
			const { remoteUrl } = await pool
				.run(
					gitPushSnapshotTask,
					{ worktreePath, branch, gitEnv },
					{ timeoutMs: 150_000 },
				)
				.catch((error: unknown) => {
					rethrowEnvironmentalGitError(error);
					throw error;
				});
			const repository = parseGitHubRemote(remoteUrl);
			if (!repository) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud workspaces need a GitHub repository",
				});
			}

			const transcriptFileId = await uploadSessionFile(
				ctx.api,
				sessionFile,
				`${input.harnessSessionId}.jsonl`,
			);
			return {
				branch,
				repositoryFullName: `${repository.owner}/${repository.name}`,
				transcriptFileId,
			};
		}),
});

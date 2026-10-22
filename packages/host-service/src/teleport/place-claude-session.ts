import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CloudAgentResume } from "@superset/shared/cloud-agent-launch";
import type { HostDb } from "../db";
import { claudeSessionPath } from "../terminal-agents/harness-sessions/claude";
import { downloadAttachment } from "../trpc/router/attachments/download";
import { resolveDefaultAccountTerminalEnv } from "../trpc/router/usage/default-account";
import type { ApiClient } from "../types";
import { rehomeClaudeSession } from "./rehome-claude-session";

/**
 * Puts a Claude session uploaded from another host where Claude, started in
 * `worktreePath` on this host, looks for it.
 */
export async function placeClaudeSession(
	ctx: { api: ApiClient; db: HostDb },
	worktreePath: string,
	resume: CloudAgentResume,
): Promise<void> {
	const [attachment] = await ctx.api.attachment.resolve.mutate({
		fileIds: [resume.transcriptFileId],
	});
	if (!attachment) throw new Error("The session file is not in cloud storage");
	const cwd = await realpath(worktreePath);
	const destination = claudeSessionPath(
		resolveDefaultAccountTerminalEnv(ctx.db),
		cwd,
		resume.harnessSessionId,
	);
	await mkdir(dirname(destination), { recursive: true });
	const download = `${destination}.download`;
	try {
		await downloadAttachment(attachment, download);
		const content = await readFile(download, "utf8");
		await writeFile(destination, rehomeClaudeSession(content, cwd), {
			mode: 0o600,
		});
	} finally {
		await rm(download, { force: true });
	}
}

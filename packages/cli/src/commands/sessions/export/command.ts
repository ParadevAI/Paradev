import { writeFile } from "node:fs/promises";
import {
	buildChatExport,
	chatExportFilename,
	chatExportJson,
	chatExportMarkdown,
	chatExportZip,
	readAllEnvelopes,
} from "@superset/chat/core";
import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

const READ_ALL_PAGE = 500;

export default command({
	description:
		"Export a chat session as a ZIP (chat.json and transcript.md), Markdown or JSON",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to export"),
		out: string().desc(
			"Write to this path (default: superset-chat-<title>-<date>.<format> in the current directory)",
		),
		format: string()
			.enum("zip", "md", "json")
			.desc("Output format (default: zip)"),
	},
	run: async ({ ctx, options }) => {
		const format = options.format ?? "zip";
		const { sessions } = await resolveSessionWorkspace(ctx, options);
		const { session } = await sessions.get.query({
			workspaceId: options.workspace,
			sessionId: options.session,
		});
		if (!session)
			throw new CLIError(
				`Session not found: ${options.session}`,
				"Run: superset sessions list --workspace WORKSPACE_ID",
			);
		const envelopes = await readAllEnvelopes((before) =>
			sessions.read.query({
				workspaceId: options.workspace,
				sessionId: options.session,
				limit: READ_ALL_PAGE,
				...(before ? { before } : {}),
			}),
		);
		const now = new Date();
		const exported = buildChatExport(session, envelopes, now);
		const path =
			options.out ?? chatExportFilename(exported.chat.title, now, format);
		await writeFile(
			path,
			format === "zip"
				? chatExportZip(exported)
				: format === "md"
					? chatExportMarkdown(exported)
					: chatExportJson(exported),
		);
		return {
			data: { path, format, messages: exported.messages.length },
			message: `Wrote ${exported.messages.length} message(s) to ${path}`,
		};
	},
});

import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description:
		"Send a follow-up prompt to a chat session, resuming it first if it is stopped",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID"),
		prompt: string().required().desc("Prompt to send to the chat session"),
	},
	run: async ({ ctx, options }) => {
		if (!options.prompt.trim()) {
			throw new CLIError(
				"Missing --prompt",
				"Pass a non-empty --prompt to send to the chat session",
			);
		}

		const { sessions } = await resolveSessionWorkspace(ctx, options);

		const resumed = await sessions.resume.mutate({
			workspaceId: options.workspace,
			sessionId: options.session,
		});
		const result = await sessions.send.mutate({
			workspaceId: options.workspace,
			sessionId: resumed.sessionId,
			prompt: options.prompt,
		});
		const resumedNote =
			resumed.sessionId === options.session
				? ""
				: ` (resumed ${options.session} as ${resumed.sessionId})`;

		return {
			data: { ...result, sessionId: resumed.sessionId },
			message: result.queued
				? `Queued prompt ${result.itemId} for session ${resumed.sessionId}${resumedNote}`
				: `Sent prompt ${result.itemId} to session ${resumed.sessionId}${resumedNote}`,
		};
	},
});

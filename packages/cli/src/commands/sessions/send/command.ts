import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description: "Send a follow-up prompt to a chat session",
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

		const result = await sessions.send.mutate({
			workspaceId: options.workspace,
			sessionId: options.session,
			prompt: options.prompt,
		});

		return {
			data: result,
			message: result.queued
				? `Queued prompt ${result.itemId} for session ${options.session}`
				: `Sent prompt ${result.itemId} to session ${options.session}`,
		};
	},
});

import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description:
		"Rename a chat session, or regenerate its title from the conversation",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to rename"),
		title: string().desc("New title (omit to regenerate one)"),
	},
	run: async ({ ctx, options }) => {
		const title = options.title?.trim();
		if (title === "")
			throw new CLIError(
				"Missing --title",
				"Pass a title, or omit --title to regenerate one",
			);
		const { sessions } = await resolveSessionWorkspace(ctx, options);
		const result = await sessions.rename.mutate({
			workspaceId: options.workspace,
			sessionId: options.session,
			...(title ? { title } : {}),
		});
		return { data: result, message: `Renamed to "${result.title}"` };
	},
});

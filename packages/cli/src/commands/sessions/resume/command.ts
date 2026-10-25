import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description: "Resume a stopped chat session in a workspace",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to resume"),
	},
	run: async ({ ctx, options }) => {
		const { sessions } = await resolveSessionWorkspace(ctx, options);

		const result = await sessions.resume.mutate({
			workspaceId: options.workspace,
			sessionId: options.session,
		});

		return {
			data: result,
			message: `Resumed ${result.label} chat session ${result.sessionId} in workspace ${options.workspace}`,
		};
	},
});

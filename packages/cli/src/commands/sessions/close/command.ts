import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description: "Close (stop) a running chat session",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to close"),
	},
	run: async ({ ctx, options }) => {
		const { sessions } = await resolveSessionWorkspace(ctx, options);

		await sessions.close.mutate({
			workspaceId: options.workspace,
			sessionId: options.session,
		});

		return {
			data: { sessionId: options.session, closed: true },
			message: `Closed session ${options.session}`,
		};
	},
});

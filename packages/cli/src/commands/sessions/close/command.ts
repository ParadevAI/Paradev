import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { closePanes } from "../../../lib/pane-placement";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description: "Stop a running chat session and close the panes that show it",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to close"),
	},
	run: async ({ ctx, options }) => {
		const { sessions, target } = await resolveSessionWorkspace(ctx, options);

		// A chat pane restarts a stopped session it still shows, so it closes first.
		const closedPaneIds = await closePanes(
			target.client,
			options.workspace,
			(pane) => pane.sessionId === options.session,
		);
		await sessions.close.mutate({
			workspaceId: options.workspace,
			sessionId: options.session,
		});

		return {
			data: { sessionId: options.session, closed: true, closedPaneIds },
			message: `Closed session ${options.session}${closedPaneIds.length > 0 ? ` and its pane ${closedPaneIds.join(", ")}` : ""}`,
		};
	},
});

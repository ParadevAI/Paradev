import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	closedPanesMessage,
	closePanes,
	paneCloseError,
	stopFailedError,
} from "../../../lib/pane-placement";
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
		const panes = await closePanes(
			target.client,
			options.workspace,
			(pane) => pane.sessionId === options.session,
		);
		await sessions.close
			.mutate({
				workspaceId: options.workspace,
				sessionId: options.session,
			})
			.catch((error: unknown) => {
				throw stopFailedError(`session ${options.session}`, panes, error);
			});

		if (panes.error)
			throw paneCloseError(`session ${options.session}`, panes.error);

		return {
			data: {
				sessionId: options.session,
				closed: true,
				closedPaneIds: panes.closedPaneIds,
			},
			message: closedPanesMessage(
				`session ${options.session}`,
				panes.closedPaneIds,
			),
		};
	},
});

import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { desktopWorkspaceLink, openUrl } from "../../../lib/open-url";
import {
	resolveSessionWorkspace,
	sessionWorkspaceOptions,
} from "../../../lib/sessions";

export default command({
	description: "Open a chat session in the Superset desktop app",
	options: {
		...sessionWorkspaceOptions,
		session: string().required().desc("Chat session ID to open"),
		print: boolean().desc(
			"Print the deep link URL instead of opening the desktop app",
		),
	},
	run: async ({ ctx, options }) => {
		const { workspace, sessions } = await resolveSessionWorkspace(ctx, options);

		const found = await sessions.get.query({
			workspaceId: options.workspace,
			sessionId: options.session,
		});

		if (!found.session) {
			throw new CLIError(
				`Session not found in workspace ${options.workspace}: ${options.session}`,
				"Run `superset sessions list` to see chat sessions in this workspace",
			);
		}

		const url = desktopWorkspaceLink(workspace.id, {
			sessionId: found.session.sessionId,
		});

		if (!options.print) {
			try {
				await openUrl(url);
			} catch (err) {
				throw new CLIError(
					"Failed to open desktop app",
					err instanceof Error ? err.message : String(err),
				);
			}
		}

		return {
			data: {
				workspaceId: workspace.id,
				sessionId: found.session.sessionId,
				url,
			},
			message: options.print
				? url
				: `Opening session ${found.session.sessionId} in Superset desktop`,
		};
	},
});

import { CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";

export default command({
	description:
		"List the desktop app's windows and the workspace each one shows, focused window first",
	options: {
		host: string().desc(
			"Host whose desktop app to ask (default: this machine)",
		),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["state", "workspaceName", "workspaceId", "route"],
			["STATE", "WORKSPACE", "WORKSPACE ID", "ROUTE"],
			[12, 30, 36, 40],
		),
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const { windows } = await client.windows.list.query().catch((error) => {
			if (
				error instanceof Error &&
				/No procedure found on path "?windows\.list/.test(error.message)
			) {
				throw new CLIError(
					"This host is too old for `paradev windows`",
					"Update the Paradev desktop app on that host",
				);
			}
			throw error;
		});
		return windows
			.map((window) => ({
				...window,
				state: window.focused
					? "focused"
					: !window.visible
						? "hidden"
						: window.lastFocused
							? "last used"
							: "open",
			}))
			.sort(
				(a, b) =>
					Number(b.focused) - Number(a.focused) ||
					Number(b.lastFocused) - Number(a.lastFocused),
			);
	},
});

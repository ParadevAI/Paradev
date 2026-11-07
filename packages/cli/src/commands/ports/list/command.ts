import { string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	forwardsWorkspaceId,
	listForwards,
} from "../../../lib/workspace-forwards";

export default command({
	description:
		"List the ports of a cloud workspace that people have forwarded, with each person's local address",
	options: {
		workspace: string().desc(
			"Cloud workspace ID (default: the workspace this terminal is in)",
		),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["port", "localUrl", "user", "since"],
			["PORT", "FORWARDED TO", "BY", "SINCE"],
			[8, 28, 24, 26],
		),
	run: async ({ ctx, options }) => {
		const rows = await listForwards(
			ctx.api,
			forwardsWorkspaceId(options.workspace),
		);
		return {
			data: rows,
			message:
				rows.length === 0
					? "No ports of this workspace are forwarded. People forward them from Share → Ports in Paradev."
					: undefined,
		};
	},
});

import { CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	forwardsWorkspaceId,
	listForwards,
} from "../../../lib/workspace-forwards";

export default command({
	description:
		"Print where a cloud workspace port is forwarded, one local address per person",
	args: [positional("port").required().desc("Port inside the workspace")],
	options: {
		workspace: string().desc(
			"Cloud workspace ID (default: the workspace this terminal is in)",
		),
	},
	run: async ({ ctx, args, options }) => {
		const port = Number(args.port);
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			throw new CLIError(`Not a port: ${String(args.port)}`);
		}
		const rows = (
			await listForwards(ctx.api, forwardsWorkspaceId(options.workspace))
		).filter((row) => row.port === port);
		if (rows.length === 0) {
			throw new CLIError(
				`Port ${port} is not forwarded by anyone`,
				"Forward it from Share → Ports in Paradev",
			);
		}
		return {
			data: rows,
			message: rows.map((row) => `${row.localUrl} (${row.user})`).join("\n"),
		};
	},
});

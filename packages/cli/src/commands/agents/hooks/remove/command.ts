import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { removeAgentHooks } from "./remove-agent-hooks";

export default command({
	description:
		"Remove the hooks Paradev wrote into agents' global configs (e.g. ~/.claude/settings.json, ~/.config/devin/config.json)",
	skipMiddleware: true,
	options: {
		all: boolean().desc("Remove the hooks of every supported agent"),
		agent: string()
			.variadic()
			.desc("Agent id to remove hooks for (e.g. `devin`). Repeatable"),
	},
	run: async ({ options }) => {
		const { agents, failed } = removeAgentHooks({
			all: options.all ?? undefined,
			agent: options.agent ?? undefined,
		});
		if (failed.length > 0) {
			throw new CLIError(
				`Could not remove some hooks: ${failed.join(", ")}`,
				"See the warnings above, fix the file, and run the command again",
			);
		}
		return {
			data: { agents },
			message: `Removed Paradev hooks for ${agents.join(", ")}. The Paradev app adds them again when it starts; turn an agent off in Settings → Agents → Paradev hooks to keep them out.`,
		};
	},
});

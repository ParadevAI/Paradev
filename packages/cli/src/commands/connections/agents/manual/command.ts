import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description:
		"Leave an agent's sign-in to your own tooling in your cloud workspaces; nothing is stored or injected for it",
	args: [positional("agent").required().desc("Agent: claude or codex")],
	run: async ({ ctx, args }) => {
		const agent = args.agent as string;
		if (agent !== "claude" && agent !== "codex") {
			throw new CLIError(
				`${agent} cannot be set to manual`,
				"Use claude or codex",
			);
		}
		const saved = await ctx.api.agentCredential.setManual.mutate({ agent });
		const loginFile =
			agent === "claude"
				? "~/.claude/.credentials.json or an apiKeyHelper"
				: "~/.codex/auth.json";
		return {
			data: saved,
			message: `${saved.agent} is manual in your cloud workspaces: your own script keeps ${loginFile} current`,
		};
	},
});

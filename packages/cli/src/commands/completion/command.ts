import {
	generateBashCompletion,
	generateZshCompletion,
	introspectCli,
	positional,
} from "@superset/cli-framework";
import { CLI_COMMAND_NAMES } from "../../lib/bin-aliases";
import { command } from "../../lib/command";

export default command({
	description:
		"Print a shell completion script; load it with: source <(paradev completion zsh)",
	skipMiddleware: true,
	args: [
		positional("shell")
			.enum("bash", "zsh")
			.required()
			.desc("Shell to generate the script for"),
	],
	run: async ({ args }) => {
		const generate =
			args.shell === "zsh" ? generateZshCompletion : generateBashCompletion;
		const cli = introspectCli();
		return {
			raw: generate({
				...cli,
				binAliases: CLI_COMMAND_NAMES.filter((name) => name !== cli.name),
			}),
		};
	},
});

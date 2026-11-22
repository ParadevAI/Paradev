import { string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveBrowserTarget } from "../../shared";

export default command({
	description: "List the Chrome extensions installed in your browser panes",
	options: {
		host: string().desc("Host to ask (default: this machine)"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const { extensions } = await client.browser.extensions.list.query();
		return {
			data: extensions,
			message: extensions.length
				? extensions
						.map(
							(e) =>
								`${e.id}\t${e.name} ${e.version}${e.pinned ? "\t(pinned)" : ""}`,
						)
						.join("\n")
				: "No extensions installed.",
		};
	},
});

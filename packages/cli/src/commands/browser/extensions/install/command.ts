import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveBrowserTarget } from "../../shared";
import { parseExtensionId } from "../utils/parseExtensionId";

export default command({
	description:
		"Install a Chrome Web Store extension in your browser panes. The app asks you first.",
	args: [
		positional("extension")
			.required()
			.desc("Extension ID or Chrome Web Store URL"),
	],
	options: {
		host: string().desc("Host to install on (default: this machine)"),
	},
	run: async ({ ctx, args, options }) => {
		const extensionId = parseExtensionId(args.extension as string);
		const { client } = await resolveBrowserTarget(ctx, options);
		const result = await client.browser.extensions.install.mutate({
			extensionId,
		});
		const { name, version } = result.extension;
		return {
			data: result,
			message:
				result.status === "already-installed"
					? `${name} ${version} is already installed.`
					: `Installed ${name} ${version}. Pin it to the toolbar from the Extensions menu.`,
		};
	},
});

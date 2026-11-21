import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveBrowserTarget } from "../../shared";
import { parseExtensionId } from "../utils/parseExtensionId";

export default command({
	description:
		"Remove an extension and its data from your browser panes. The app asks you first.",
	args: [
		positional("extension")
			.required()
			.desc("Extension ID (from `superset browser extensions list`)"),
	],
	options: {
		host: string().desc("Host to remove it from (default: this machine)"),
	},
	run: async ({ ctx, args, options }) => {
		const extensionId = parseExtensionId(args.extension as string);
		const { client } = await resolveBrowserTarget(ctx, options);
		await client.browser.extensions.remove.mutate({ extensionId });
		return { data: { extensionId }, message: `Removed ${extensionId}.` };
	},
});

import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveBrowserTarget } from "../../shared";
import { parseExtensionId } from "../utils/parseExtensionId";

export default command({
	description: "Unpin an extension from the browser pane toolbar",
	args: [
		positional("extension")
			.required()
			.desc("Extension ID (from `superset browser extensions list`)"),
	],
	options: {
		host: string().desc("Host the extension is on (default: this machine)"),
	},
	run: async ({ ctx, args, options }) => {
		const extensionId = parseExtensionId(args.extension as string);
		const { client } = await resolveBrowserTarget(ctx, options);
		await client.browser.extensions.setPinned.mutate({
			extensionId,
			pinned: false,
		});
		return {
			data: { extensionId, pinned: false },
			message: `Unpinned ${extensionId}.`,
		};
	},
});

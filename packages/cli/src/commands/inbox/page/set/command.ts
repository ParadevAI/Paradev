import { resolve } from "node:path";
import { number, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { readDocument } from "../../document";

export default command({
	description:
		"Replace a card's document with a block document from disk. Every write is one version; pass --if-version to refuse a write over someone else's",
	args: [
		positional("card").required().desc("Card id"),
		positional("file").required().desc("Path to a block document (.json)"),
	],
	options: {
		ifVersion: number().desc(
			"The version you last pulled. The write is refused if the document has moved on",
		),
	},
	run: async ({ ctx, args, options }) => {
		const document = readDocument(resolve(process.cwd(), args.file as string));
		const result = await ctx.api.inbox.setDocument.mutate({
			id: args.card as string,
			document,
			ifVersion: options.ifVersion ?? undefined,
		});
		return {
			data: result,
			message: `Document is now v${result.version}`,
		};
	},
});

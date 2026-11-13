import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

export default command({
	description: "Copy a page into a new private page of your own",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		title: string().desc('Title of the copy (defaults to "<title> (copy)")'),
	},
	run: async ({ ctx, args, options }) => {
		const source = await ctx.api.page.get.query(
			pageRefFromArg(args.page as string),
		);
		const copy = await ctx.api.page.duplicate.mutate({
			id: source.id,
			title: options.title ?? `${source.title} (copy)`.slice(0, 200),
		});
		return { data: copy, message: `Duplicated as ${copy.url}` };
	},
});

import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Permanently delete an archived automation and its run history (archive it first)",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		await ctx.api.automation.deleteArchived.mutate({ id });
		return {
			data: { ok: true },
			message: `Deleted automation ${id}`,
		};
	},
});

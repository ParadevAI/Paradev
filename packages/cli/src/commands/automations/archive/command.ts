import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Archive an automation (stops its triggers and hides it; `unarchive` restores it)",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		await ctx.api.automation.archive.mutate({ id });
		return {
			data: { ok: true },
			message: `Archived automation ${id}`,
		};
	},
});

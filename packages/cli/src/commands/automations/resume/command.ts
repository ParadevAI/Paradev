import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Resume a paused automation",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const result = await ctx.api.automation.setEnabled.mutate({
			id,
			enabled: true,
		});
		return {
			data: result,
			message: `Resumed automation ${id}. Next run: ${result.nextRunAt?.toISOString() ?? "—"}`,
		};
	},
});

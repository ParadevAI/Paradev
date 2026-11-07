import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Restore an archived automation, paused (`resume` starts it)",
	aliases: ["restore"],
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		await ctx.api.automation.unarchive.mutate({ id });
		return {
			data: { ok: true },
			message: `Restored automation ${id} (paused)`,
		};
	},
});

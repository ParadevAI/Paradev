import { positional, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { cloudWorkspaceId } from "../cloudWorkspaceId";
import { describeActivity } from "./describeActivity";

export default command({
	description:
		"Show a cloud workspace's timeline, oldest first: renames, task links, labels, sharing, pull requests. Inside a cloud workspace it defaults to that workspace",
	args: [
		positional("id").desc(
			"Cloud workspace ID (default: the cloud workspace this runs in)",
		),
	],
	display: (data) =>
		table(
			(data as Parameters<typeof describeActivity>[0][]).map((entry) => ({
				at: new Date(entry.at).toISOString(),
				by: entry.actor.kind === "user" ? entry.actor.person.name : "system",
				what: describeActivity(entry),
			})),
			["at", "by", "what"],
			["AT", "BY", "WHAT"],
		),
	run: async ({ ctx, args }) => {
		const id = cloudWorkspaceId(args.id as string | undefined);
		return ctx.api.cloudWorkspace.activity.query({ id });
	},
});

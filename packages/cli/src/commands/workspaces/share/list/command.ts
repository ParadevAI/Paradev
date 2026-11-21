import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { cloudWorkspaceId } from "../../cloudWorkspaceId";

export default command({
	description:
		"Show who a cloud workspace is shared with, and its visibility. Inside a cloud workspace it defaults to that workspace",
	args: [
		positional("id").desc(
			"Cloud workspace ID (default: the cloud workspace this runs in)",
		),
	],
	run: async ({ ctx, args }) => {
		const id = cloudWorkspaceId(args.id as string | undefined);
		const sharing = await ctx.api.cloudWorkspace.sharing.get.query({ id });
		return {
			data: sharing,
			message: [
				`Owner:      ${sharing.owner?.email ?? sharing.owner?.name ?? "—"}`,
				`Visibility: ${sharing.visibility}`,
				`Shared with: ${sharing.grantees.length ? "" : sharing.visibility === "org" ? "no one by name (the whole organization can see it)" : "nobody"}`,
				...sharing.grantees.map((grantee) =>
					grantee.kind === "user"
						? `  user ${grantee.email} (${grantee.userId})`
						: grantee.kind === "team"
							? `  team ${grantee.name} (${grantee.teamId})`
							: `  invitation ${grantee.email}`,
				),
			].join("\n"),
		};
	},
});

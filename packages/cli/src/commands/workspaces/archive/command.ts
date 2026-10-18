import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { rawErrorMessage } from "@superset/i18n/errors";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import {
	archiveOnHost,
	type DeleteReport,
	reportHostOutcomes,
} from "./archiveOnHost";

export default command({
	description:
		"Archive workspaces by ID: cloud workspaces by default if your account has them, else on this machine; --local or --host picks a host. A cloud sandbox stops within a minute and is deleted after 7 days; a restore before then keeps its disk. On a host, a worktree's folder is removed with any uncommitted changes; its branch stays, so a restore brings back only committed work",
	aliases: ["delete"],
	args: [positional("ids").required().variadic().desc("Workspace IDs")],
	options: {
		host: string().desc("Host the workspaces live on"),
		local: boolean().desc("The workspaces are on this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		if (!hostId) {
			const archived: string[] = [];
			const missing: string[] = [];
			const failed: DeleteReport["failed"] = [];
			for (const id of ids) {
				try {
					const result = await ctx.api.cloudWorkspace.delete.mutate({ id });
					(result.deleted ? archived : missing).push(id);
				} catch (error) {
					failed.push({ id, reason: rawErrorMessage(error) });
				}
			}
			const data: DeleteReport = {
				deleted: archived,
				notFound: missing,
				failed,
				warnings: [],
			};
			if (missing.length > 0 || failed.length > 0) {
				const lines = [
					...(missing.length > 0
						? [`No cloud workspace in this organization: ${missing.join(", ")}`]
						: []),
					...failed.map(({ id, reason }) => `Failed: ${id}: ${reason}`),
				];
				const alsoArchived =
					archived.length > 0 ? ` (archived: ${archived.join(", ")})` : "";
				throw new CLIError(
					`${lines.join("\n")}${alsoArchived}`,
					missing.length > 0
						? "Pass --local or --host <id> if it lives on a machine"
						: undefined,
					data,
				);
			}
			return {
				data,
				message:
					archived.length === 1
						? `Archived cloud workspace ${archived[0]}`
						: `Archived ${archived.length} cloud workspaces`,
			};
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		return reportHostOutcomes(
			await archiveOnHost(target.client, ids),
			target.hostId,
		);
	},
});

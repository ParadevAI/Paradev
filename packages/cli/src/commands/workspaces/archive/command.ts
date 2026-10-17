import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { archiveOnHost } from "./archiveOnHost";

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
			for (const id of ids) {
				const result = await ctx.api.cloudWorkspace.delete.mutate({ id });
				(result.deleted ? archived : missing).push(id);
			}
			if (missing.length > 0) {
				const alsoArchived =
					archived.length > 0 ? ` (archived: ${archived.join(", ")})` : "";
				throw new CLIError(
					`No cloud workspace in this organization: ${missing.join(", ")}${alsoArchived}`,
					"Pass --local or --host <id> if it lives on a machine",
				);
			}
			return {
				data: { deleted: archived },
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

		const outcomes = await archiveOnHost(target.client, ids);
		const archived: string[] = [];
		const warnings: string[] = [];
		const notFound: string[] = [];
		const failed: { id: string; reason: string }[] = [];
		for (const outcome of outcomes) {
			if (outcome.status === "deleted") {
				archived.push(outcome.id);
				for (const warning of outcome.warnings) {
					warnings.push(`${outcome.id}: ${warning}`);
				}
			} else if (outcome.status === "not_found") {
				notFound.push(outcome.id);
			} else {
				failed.push({ id: outcome.id, reason: outcome.reason });
			}
		}

		const lines = [
			...archived.map((id) => `Archived workspace ${id}`),
			...warnings.map((warning) => `Warning: ${warning}`),
			...notFound.map(
				(id) => `Not found: no workspace ${id} on host ${target.hostId}`,
			),
			...failed.map(({ id, reason }) => `Failed: ${id}: ${reason}`),
		];
		if (notFound.length > 0 || failed.length > 0) {
			throw new CLIError(
				lines.join("\n"),
				notFound.length > 0
					? "Pass full workspace IDs (superset workspaces list), and --host <id> for a workspace on another machine"
					: undefined,
			);
		}
		return {
			data: { deleted: archived, warnings },
			message:
				archived.length === 1 && warnings.length === 0
					? `Archived workspace ${archived[0]}`
					: lines.join("\n"),
		};
	},
});

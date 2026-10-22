import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { confirmByName } from "../../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Disconnect one of the organization's GitHub App installations; environments and workspaces built on its repositories cannot start until it is connected again",
	options: {
		account: string().desc(
			"GitHub organization or account login to disconnect; required when several are installed",
		),
		yes: boolean().desc(
			"Disconnect without asking; required without a terminal",
		),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const installations =
			await ctx.api.integration.github.listInstallations.query({
				organizationId,
			});
		if (installations.length === 0) {
			return {
				data: { disconnected: false },
				message: "The GitHub App is not installed",
			};
		}
		const wanted = options.account?.toLowerCase();
		const installation = wanted
			? installations.find((row) => row.accountLogin.toLowerCase() === wanted)
			: installations.length === 1
				? installations[0]
				: undefined;
		if (!installation) {
			const accounts = installations.map((row) => row.accountLogin).join(", ");
			throw new CLIError(
				wanted
					? `The GitHub App is not installed on ${options.account}`
					: "Several GitHub accounts are installed",
				`Pass --account with one of: ${accounts}`,
			);
		}
		await confirmByName({
			name: installation.accountLogin,
			consequence: `Disconnecting ${installation.accountLogin} stops its repositories syncing; environments and cloud workspaces built on them cannot start until it is connected again`,
			yes: options.yes,
			rerun: `superset integrations github disconnect --account ${installation.accountLogin}`,
		});
		await ctx.api.integration.github.disconnect.mutate({
			organizationId,
			installationId: installation.id,
		});
		return {
			data: { disconnected: true, account: installation.accountLogin },
			message: `Disconnected the GitHub App from ${installation.accountLogin}`,
		};
	},
});

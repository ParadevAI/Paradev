import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { confirmByName } from "../../../../lib/environments";

export default command({
	sandbox: false,
	description:
		"Disconnect a GitHub account from the organization's GitHub App; its repositories leave every environment that uses them",
	options: {
		account: string().desc(
			"GitHub account login to disconnect; required when several are connected",
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
		const installation = options.account
			? installations.find(
					(candidate) =>
						candidate.accountLogin.toLowerCase() ===
						options.account?.toLowerCase(),
				)
			: installations.length === 1
				? installations[0]
				: undefined;
		if (!installation) {
			const accounts = installations.map((i) => i.accountLogin).join(", ");
			throw new CLIError(
				options.account
					? `${options.account} is not connected. Connected: ${accounts}`
					: `Several GitHub accounts are connected: ${accounts}`,
				"Run: superset integrations github disconnect --account <login>",
			);
		}
		await confirmByName({
			name: installation.accountLogin,
			consequence: `Disconnecting ${installation.accountLogin} removes its repositories from this organization's cloud environments`,
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

import { boolean, CLIError } from "@superset/cli-framework";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { command } from "../../../../lib/command";
import { getApiUrl } from "../../../../lib/config";
import { canReachDesktop, openUrl } from "../../../../lib/open-url";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10 * 60_000;

export default command({
	sandbox: false,
	description:
		"Install the Superset GitHub App for the organization in the browser, so its repositories can back cloud environments",
	options: {
		add: boolean().desc(
			"Install on another GitHub organization or account beside the ones already connected",
		),
		noWait: boolean().desc("Print the install URL and exit without waiting"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		const existing = await ctx.api.integration.github.listInstallations.query({
			organizationId,
		});
		if (existing.length > 0 && !options.add) {
			const accounts = existing.map((row) => row.accountLogin).join(", ");
			return {
				data: { installations: existing },
				message: `Already installed on ${accounts}. Choose which repositories it can see in that account's GitHub settings, or install on another account with --add.`,
			};
		}

		if (!(await ctx.api.integration.syncAllowed.query({ organizationId }))) {
			throw new CLIError(
				"GitHub sync requires the Pro plan",
				`Upgrade at ${CANONICAL_URLS.MARKETING}/pricing, or in the app under Settings → Billing.`,
			);
		}

		const url = `${getApiUrl()}/api/github/install?organizationId=${organizationId}`;
		const opened =
			canReachDesktop() &&
			(await openUrl(url).then(
				() => true,
				() => false,
			));
		const instructions = `${opened ? "If your browser did not open, open" : "Open"} this URL, signed in to Superset in that browser, to install the GitHub App:\n  ${url}`;
		if (options.noWait) {
			return { data: { url }, message: instructions };
		}
		process.stderr.write(`${instructions}\nWaiting for the installation…\n`);

		const known = new Set(existing.map((row) => row.id));
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			const installations =
				await ctx.api.integration.github.listInstallations.query({
					organizationId,
				});
			const added = installations.find((row) => !known.has(row.id));
			if (added) {
				return {
					data: { installation: added, installations },
					message: `Installed on ${added.accountLogin}. Its repositories appear within a minute: superset environments repos`,
				};
			}
		}
		throw new CLIError(
			"The GitHub App was not installed in 10 minutes",
			"Run: superset integrations github connect",
		);
	},
});

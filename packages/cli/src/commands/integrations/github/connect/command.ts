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
		"Install the Paradev GitHub App on a GitHub organization or account in the browser, so its repositories can back cloud environments; run again to add another",
	options: {
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
		const known = new Set(existing.map((installation) => installation.id));

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
		const action =
			existing.length > 0
				? `add another GitHub organization or account (connected: ${existing.map((i) => i.accountLogin).join(", ")})`
				: "install the GitHub App";
		const instructions = `${opened ? "If your browser did not open, open" : "Open"} this URL, signed in to Paradev in that browser, to ${action}:\n  ${url}`;
		if (options.noWait) {
			return { data: { url }, message: instructions };
		}
		const waiting =
			existing.length > 0
				? "Waiting for a new GitHub account… Picking an account that is already connected only updates its repository access; press Ctrl+C once you have saved it."
				: "Waiting for the installation…";
		process.stderr.write(`${instructions}\n${waiting}\n`);

		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
			const installations =
				await ctx.api.integration.github.listInstallations.query({
					organizationId,
				});
			const installation = installations.find(
				(candidate) => !known.has(candidate.id),
			);
			if (installation) {
				return {
					data: { installation },
					message: `Installed on ${installation.accountLogin}. Its repositories appear within a minute: superset environments repos`,
				};
			}
		}
		throw new CLIError(
			"The GitHub App was not installed in 10 minutes",
			"Run: superset integrations github connect",
		);
	},
});

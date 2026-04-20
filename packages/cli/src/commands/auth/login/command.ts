import * as p from "@clack/prompts";
import { string } from "@superset/cli-framework";
import { createApiClient } from "../../../lib/api-client";
import { login } from "../../../lib/auth";
import { command } from "../../../lib/command";
import { getApiUrl, readConfig, writeConfig } from "../../../lib/config";

export default command({
	description: "Authenticate with Superset. Re-run to switch organizations.",
	skipMiddleware: true,
	options: {
		apiUrl: string().env("SUPERSET_API_URL").desc("Override API URL"),
	},
	run: async (opts) => {
		const config = readConfig();
		if (opts.options.apiUrl) config.apiUrl = opts.options.apiUrl;

		const apiUrl = getApiUrl(config);

		p.intro("superset auth login");

		// Clack's spinner redraws with ANSI cursor moves, which only works over a
		// real TTY. When stdout is piped (e.g. `bun run dev` → turbo → terminal)
		// every frame flushes as a new line, spamming the output.
		const spinner = process.stdout.isTTY ? p.spinner() : null;
		spinner?.start("Waiting for browser authorization...");
		if (!spinner) p.log.info("Waiting for browser authorization…");

		const result = await login(config, opts.signal);

		config.auth = {
			accessToken: result.accessToken,
			expiresAt: result.expiresAt,
		};
		writeConfig(config);

		spinner?.stop("Authorized!");
		if (!spinner) p.log.success("Authorized!");

		try {
			const api = createApiClient(config, { bearer: result.accessToken });
			const user = await api.user.me.query();
			const organization = await api.user.myOrganization.query();
			p.log.info(`${user.name} (${user.email})`);
			if (organization) p.log.info(`Organization: ${organization.name}`);
		} catch {
			// Non-fatal
		}

		p.outro("Logged in successfully.");
		return { data: { apiUrl } };
	},
});

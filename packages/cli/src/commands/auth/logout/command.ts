import { command } from "../../../lib/command";
import { readConfig, writeConfig } from "../../../lib/config";
import { forgetOrganizationTokens } from "../../../lib/organization-token";

export default command({
	sandbox: false,
	description: "Clear stored credentials",
	skipMiddleware: true,
	run: async () => {
		const config = readConfig();
		delete config.auth;
		delete config.apiKey;
		writeConfig(config);
		forgetOrganizationTokens();
		return { message: "Logged out." };
	},
});

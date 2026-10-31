import type { UsageLogins } from "../../../../../../hooks/useHostUsageLogins";
import type { ManagedAgent } from "../../../../utils/visibleQuotaAgents";

/** The dir-name part of a new profile, safe inside a double-quoted shell string. */
export function slugifyProfileName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function profileHome(
	homeDir: string,
	agent: ManagedAgent,
	slug: string,
): string {
	return `${homeDir}/.${agent}-${slug}`;
}

/** Whether the profile dir for `slug` already holds a discovered login. */
export function isProfileHomeTaken(
	logins: UsageLogins,
	agent: ManagedAgent,
	slug: string,
): boolean {
	const home = profileHome(logins.homeDir, agent, slug);
	return agent === "claude"
		? logins.claude.some((login) => login.configDir === home)
		: logins.codex.some((login) => login.home === home);
}

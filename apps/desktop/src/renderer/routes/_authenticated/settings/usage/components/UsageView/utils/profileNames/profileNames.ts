import type { UsageLogins } from "../../../../hooks/useHostUsageLogins";
import type { ManagedAgent } from "../visibleQuotaAgents";

const DEFAULT_PROFILE_NAME = "work";

export function profileDir(
	homeDir: string,
	agent: ManagedAgent,
	slug: string,
): string {
	return `${homeDir}/.${agent}-${slug}`;
}

function samePath(left: string, right: string): boolean {
	const normalize = (path: string) =>
		path.replaceAll("\\", "/").replace(/\/+/g, "/").replace(/\/$/, "");
	return normalize(left) === normalize(right);
}

export function isProfileSignedIn(
	logins: UsageLogins,
	agent: ManagedAgent,
	slug: string,
): boolean {
	const dir = profileDir(logins.homeDir, agent, slug);
	return agent === "claude"
		? logins.claude.some((login) => samePath(login.configDir, dir))
		: logins.codex.some((login) => samePath(login.home, dir));
}

export function freeProfileName(
	logins: UsageLogins,
	agent: ManagedAgent,
): string {
	for (let suffix = 1; ; suffix++) {
		const name =
			suffix === 1 ? DEFAULT_PROFILE_NAME : `${DEFAULT_PROFILE_NAME}-${suffix}`;
		if (!isProfileSignedIn(logins, agent, name)) return name;
	}
}

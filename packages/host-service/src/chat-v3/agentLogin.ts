import { envOverlayPrefix } from "@superset/shared/agent-prompt-launch";

const LOGINS: Record<string, { command: string; profileEnv?: string }> = {
	claude: { command: "claude auth login", profileEnv: "CLAUDE_CONFIG_DIR" },
	codex: { command: "codex login", profileEnv: "CODEX_HOME" },
	opencode: { command: "opencode auth login" },
};

/**
 * Signs in the same login the chat's agent runs with: Claude Code keys its
 * Keychain item on the literal `CLAUDE_CONFIG_DIR`, so the launch's own value
 * goes with the command.
 */
export function agentLoginCommand(
	binary: string,
	env: NodeJS.ProcessEnv,
): string | undefined {
	const login = LOGINS[binary];
	if (!login) return undefined;
	const profile = login.profileEnv ? env[login.profileEnv] : undefined;
	const prefix =
		login.profileEnv && profile
			? envOverlayPrefix({ [login.profileEnv]: profile })
			: "";
	return `${prefix}${login.command}`;
}

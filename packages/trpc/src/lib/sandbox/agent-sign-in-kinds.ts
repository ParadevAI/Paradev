import type { AgentSignIns } from "../../router/agent-credential";

/**
 * What a running agent fixes when it starts: which credential variable it
 * reads, its endpoint, and for Codex its provider and ChatGPT account. A new
 * value of the same kind reaches it through the firewall; anything else needs
 * a restart of that agent. Manual is a kind: the agent must drop the
 * placeholder it started with to read the login file a script keeps.
 */
export function agentSignInKinds(signIns: AgentSignIns): string {
	const env = signIns.env;
	const manual = new Set(signIns.manual);
	const claude = manual.has("claude")
		? "manual"
		: env.CLAUDE_CODE_OAUTH_TOKEN
			? "subscription"
			: env.ANTHROPIC_AUTH_TOKEN
				? "auth-token"
				: env.ANTHROPIC_API_KEY
					? "api-key"
					: null;
	const codex = manual.has("codex")
		? "manual"
		: signIns.codexChatgpt
			? `chatgpt:${signIns.codexChatgpt.accountId}`
			: env.OPENAI_API_KEY
				? `api-key@${env.OPENAI_BASE_URL ?? ""}`
				: null;
	return JSON.stringify({
		claude: claude ? `${claude}@${env.ANTHROPIC_BASE_URL ?? ""}` : "none",
		codex: codex ?? "none",
	});
}

/**
 * Agents whose kind changed since the box booted and that are still signed
 * in. A box booted before kinds were recorded holds an older digest and
 * names none.
 */
export function agentsToRestart(
	booted: string | null,
	current: string,
): string[] {
	let before: unknown;
	try {
		before = JSON.parse(booted ?? "");
	} catch {
		return [];
	}
	if (typeof before !== "object" || before === null) return [];
	const was = before as Record<string, string>;
	const now = JSON.parse(current) as Record<string, string>;
	return Object.keys(now).filter(
		(agent) =>
			now[agent] !== "none" && agent in was && was[agent] !== now[agent],
	);
}

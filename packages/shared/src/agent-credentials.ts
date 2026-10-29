/**
 * The environment variables a signed-in agent reads inside a cloud workspace.
 *
 * A Claude subscription is a long-lived token Claude Code accepts directly
 * (`claude setup-token`), so it needs no refreshing on our side. A Codex
 * subscription is a ChatGPT sign-in: an OAuth session the API refreshes and
 * hands over as a file, not a variable. An API key is the provider key,
 * optionally against a compatible endpoint. A gateway key is an API key
 * against the gateway's endpoint for that agent, sent the way the gateway
 * documents for it.
 */
export const AGENT_CREDENTIAL_ENV_NAMES = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"ANTHROPIC_BASE_URL",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"OPENAI_API_KEY",
	"OPENAI_BASE_URL",
] as const;

export type AgentCredentialEnvName =
	(typeof AGENT_CREDENTIAL_ENV_NAMES)[number];

/**
 * What a cloud workspace never takes from an environment: the agent's
 * credential is the person's sign-in, and a key here would be picked up by
 * whatever runs in a terminal and billed with nobody looking.
 */
export const CLOUD_WORKSPACE_IGNORED_ENV_NAMES = [
	"ANTHROPIC_API_KEY",
	"ANTHROPIC_AUTH_TOKEN",
	"CLAUDE_CODE_OAUTH_TOKEN",
	"CODEX_ACCESS_TOKEN",
	"CODEX_API_KEY",
	"OPENAI_API_KEY",
] as const;

export function isCloudWorkspaceIgnoredEnvName(name: string): boolean {
	return (CLOUD_WORKSPACE_IGNORED_ENV_NAMES as readonly string[]).includes(
		name,
	);
}

/** The provider a Codex subscription row carries when it is a ChatGPT sign-in. */
export const CHATGPT_PROVIDER = "chatgpt";

const GATEWAY_BASE_URLS: Record<string, string> = {
	claude: "https://ai-gateway.vercel.sh/claude-code",
	codex: "https://ai-gateway.vercel.sh/codex/v1",
};

/** Where Vercel AI Gateway serves this agent's own wire protocol. */
export function gatewayBaseUrl(agent: string): string | null {
	return GATEWAY_BASE_URLS[agent] ?? null;
}

export interface AgentCredentialShape {
	agent: string;
	kind: "subscription" | "api_key";
	value: string;
	baseUrl?: string | null;
	provider?: string | null;
}

/** The env a credential contributes to the sandbox. Empty when we cannot place it. */
export function agentCredentialToEnv(
	credential: AgentCredentialShape,
): Partial<Record<AgentCredentialEnvName, string>> {
	const { agent, kind, value, provider } = credential;
	const baseUrl =
		credential.baseUrl ||
		(provider === "gateway" ? gatewayBaseUrl(agent) : null);
	if (agent === "claude") {
		if (kind === "subscription") return { CLAUDE_CODE_OAUTH_TOKEN: value };
		if (provider === "gateway" && baseUrl) {
			return { ANTHROPIC_AUTH_TOKEN: value, ANTHROPIC_BASE_URL: baseUrl };
		}
		return {
			ANTHROPIC_API_KEY: value,
			...(baseUrl ? { ANTHROPIC_BASE_URL: baseUrl } : {}),
		};
	}
	if (agent === "codex" && kind === "api_key") {
		return {
			OPENAI_API_KEY: value,
			...(baseUrl ? { OPENAI_BASE_URL: baseUrl } : {}),
		};
	}
	return {};
}

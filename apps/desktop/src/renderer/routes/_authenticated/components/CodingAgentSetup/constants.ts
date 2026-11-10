export type CodingAgentId = "claude" | "codex";

export const CODING_AGENT_IDS: CodingAgentId[] = ["claude", "codex"];

export const CODING_AGENT_NAMES: Record<CodingAgentId, string> = {
	claude: "Claude Code",
	codex: "Codex",
};

export const CODING_AGENT_VENDORS: Record<CodingAgentId, string> = {
	claude: "Anthropic",
	codex: "OpenAI",
};

export const CODING_AGENT_MANUAL_INSTALL_URLS: Record<CodingAgentId, string> = {
	claude: "https://code.claude.com/docs/en/setup",
	codex: "https://github.com/openai/codex/releases/latest",
};

export const CODING_AGENT_LOGIN_ARGS: Record<CodingAgentId, string> = {
	claude: "auth login",
	codex: "login --device-auth",
};

export function isCodingAgentId(value: unknown): value is CodingAgentId {
	return value === "claude" || value === "codex";
}

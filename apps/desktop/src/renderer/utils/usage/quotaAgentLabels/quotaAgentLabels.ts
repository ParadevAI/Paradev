import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";

export const QUOTA_AGENT_ORDER: readonly UsageAccount["agent"][] = [
	"claude",
	"codex",
	"grok",
	"agy",
	"opencode",
];

export const QUOTA_AGENT_LABELS: Record<UsageAccount["agent"], string> = {
	claude: "Claude Code",
	codex: "Codex",
	grok: "Grok",
	agy: "Antigravity",
	opencode: "OpenCode",
};

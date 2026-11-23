import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import pick from "lodash/pick";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";

export const QUOTA_AGENT_ORDER = [
	"claude",
	"codex",
	"grok",
	"agy",
	"opencode",
] as const satisfies readonly UsageAccount["agent"][];

export const QUOTA_AGENT_LABELS = {
	...pick(BUILTIN_AGENT_LABELS, QUOTA_AGENT_ORDER),
	claude: "Claude Code",
} satisfies Record<UsageAccount["agent"], string>;

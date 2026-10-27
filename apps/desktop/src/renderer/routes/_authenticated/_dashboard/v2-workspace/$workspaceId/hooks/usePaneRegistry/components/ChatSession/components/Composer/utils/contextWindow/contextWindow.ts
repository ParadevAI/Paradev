import type { SessionUsage } from "@superset/chat/protocol";
import { formatCurrency, formatPercent } from "@superset/i18n/format";
import { formatTokens } from "../../../../utils/formatTokens";

export type ContextWindowLevel = "normal" | "warning" | "critical";

export function contextWindowLevel(usedPercent: number): ContextWindowLevel {
	if (usedPercent > 90) return "critical";
	if (usedPercent >= 75) return "warning";
	return "normal";
}

export function contextWindow(usage: SessionUsage) {
	const usedPercent = Math.min(
		100,
		(usage.contextUsed / usage.contextSize) * 100,
	);
	return {
		usedPercent,
		level: contextWindowLevel(usedPercent),
		percent: formatPercent(usedPercent / 100, { maximumFractionDigits: 0 }),
		used: formatTokens(usage.contextUsed),
		size: formatTokens(usage.contextSize),
		remaining: formatTokens(Math.max(0, usage.contextSize - usage.contextUsed)),
		cost:
			usage.costUsd === undefined ? null : formatCurrency(usage.costUsd, "USD"),
	};
}

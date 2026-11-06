import type { AppRouter } from "@superset/host-service";
import {
	formatCompactNumber,
	formatCurrency,
	formatDate,
	formatNumber,
} from "@superset/i18n/format";
import { AGENT_IDENTITY_LABELS } from "@superset/shared/agent-catalog";
import type { CardStatId, UsageCard } from "@superset/shared/usage-card";
import type { inferRouterOutputs } from "@trpc/server";

export const DEFAULT_CARD_STATS: CardStatId[] = [
	"prs",
	"tokens",
	"agents",
	"model",
	"streak",
	"tier",
];
export type WrappedSummary = inferRouterOutputs<AppRouter>["usage"]["wrapped"];

export function buildUsageCard({
	data,
	tier,
	selected,
	showBreakdown,
	labels,
	breakdownLabel,
}: {
	data: WrappedSummary | undefined;
	tier: number | undefined;
	selected: Set<CardStatId>;
	showBreakdown: boolean;
	labels: Record<CardStatId, string>;
	breakdownLabel: string;
}): UsageCard | null {
	const values: Partial<Record<CardStatId, string>> = data
		? {
				prs: formatNumber(data.prs),
				tokens: formatCompactNumber(data.tokens),
				agents: formatNumber(data.agents.length),
				...(data.topModel ? { model: data.topModel.slice(0, 100) } : {}),
				streak: formatNumber(data.longestStreak),
				...(tier != null ? { tier: formatNumber(tier) } : {}),
				cost: formatCurrency(data.usd),
			}
		: {};
	const stats = (Object.keys(labels) as CardStatId[]).flatMap((id) =>
		selected.has(id) && values[id] !== undefined
			? [{ id, label: labels[id], value: values[id] as string }]
			: [],
	);
	const columns = (["tokens", "prs", "cost"] as const)
		.filter((id) => selected.has(id))
		.map((id) => ({ id, label: labels[id] }));
	return data && stats.length > 0
		? {
				version: 1,
				period: `${formatDate(new Date(`${data.from}T12:00:00`))} – ${formatDate(new Date(`${data.to}T12:00:00`))}`,
				stats,
				...(showBreakdown && columns.length > 0 && data.agents.length > 0
					? {
							breakdown: {
								label: breakdownLabel,
								columns,
								rows: data.agents.slice(0, 5).map((row) => ({
									name:
										row.agent === "claude"
											? "Claude Code"
											: (AGENT_IDENTITY_LABELS[
													(row.agent === "cursor"
														? "cursor-agent"
														: row.agent) as keyof typeof AGENT_IDENTITY_LABELS
												] ?? row.agent),
									values: columns.map(({ id }) =>
										id === "cost"
											? formatCurrency(row.usd)
											: id === "prs"
												? formatNumber(row.prs)
												: formatCompactNumber(row.tokens),
									),
								})),
							},
						}
					: {}),
			}
		: null;
}

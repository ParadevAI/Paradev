import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactNumber, formatCurrency } from "@superset/i18n/format";
import { workspaceTrpc } from "@superset/workspace-client";

const POLL_MS = 5_000;

interface SubagentUsageLabelProps {
	workspaceId: string;
	terminalId: string;
	subagentId: string;
	live: boolean;
}

/**
 * Tokens and estimated cost of one terminal subagent. Renders nothing for
 * harnesses that record no usage or before the child's first request.
 */
export function SubagentUsageLabel({
	workspaceId,
	terminalId,
	subagentId,
	live,
}: SubagentUsageLabelProps) {
	const { t } = useLingui();
	const { data: usage } = workspaceTrpc.terminalAgents.subagentUsage.useQuery(
		{ workspaceId, terminalId, subagentId },
		{
			refetchInterval: live ? POLL_MS : false,
			refetchOnWindowFocus: live,
			staleTime: 1_000,
		},
	);
	if (!usage) return null;
	const tokens = formatCompactNumber(usage.inputTokens + usage.outputTokens, {
		maximumFractionDigits: 1,
	});
	const cost = formatCurrency(usage.costUsd, "USD");
	return (
		<span
			className="min-w-0 truncate text-[11px] text-muted-foreground/70 tabular-nums"
			title={t({ message: "Estimated at API list prices, not money spent" })}
		>
			<Trans>
				{tokens} tokens · ~{cost}
			</Trans>
		</span>
	);
}

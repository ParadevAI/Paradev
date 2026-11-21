import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { useAccountUsage } from "../../hooks/useAccountUsage";

export function UsageWarningDot({
	workspaceId,
	terminalId,
}: {
	workspaceId: string;
	terminalId: string;
}) {
	const { t } = useLingui();
	const { binding, state, tightest } = useAccountUsage(workspaceId, terminalId);
	if (state !== "ready" || !tightest) return null;
	const percent = formatPercent(tightest.usedPercent / 100);
	const label = t({ message: `Account usage: ${percent} used` });
	if (binding?.agentId === "codex")
		return (
			<span className="shrink-0 text-[10px] tabular-nums" title={label}>
				{percent}
			</span>
		);
	if (tightest.usedPercent < 70) return null;
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className={cn(
				"size-1.5 shrink-0 rounded-full",
				tightest.usedPercent >= 90 ? "bg-red-500" : "bg-amber-500",
			)}
		/>
	);
}

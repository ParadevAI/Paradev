import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { useAccountUsage } from "../../hooks/useAccountUsage";

export function AccountUsageDot({
	workspaceId,
	terminalId,
}: {
	workspaceId: string;
	terminalId: string;
}) {
	const { t } = useLingui();
	const { state, tightest } = useAccountUsage(workspaceId, terminalId);
	if (state !== "ready" || !tightest || tightest.usedPercent < 70) return null;
	const used = formatPercent(tightest.usedPercent / 100);
	const label = t({ message: `Account usage: ${tightest.label} ${used} used` });
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

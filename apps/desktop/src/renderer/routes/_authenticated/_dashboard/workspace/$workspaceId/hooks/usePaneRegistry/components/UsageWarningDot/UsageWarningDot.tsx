import { useLingui } from "@lingui/react/macro";
import { formatPercent } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import {
	DEFAULT_USAGE_WARNING_THRESHOLD,
	useSettings,
} from "renderer/stores/settings";
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
	const location = useSettings((settings) => settings.codexUsageLocation);
	const codexThreshold = useSettings((settings) =>
		settings.codexUsageThresholdEnabled ? settings.codexUsageThreshold : 0,
	);
	if (state !== "ready" || !tightest) return null;
	const isCodex = binding?.agentId === "codex";
	if (isCodex && location !== "session") return null;
	const threshold = isCodex ? codexThreshold : DEFAULT_USAGE_WARNING_THRESHOLD;
	if (tightest.usedPercent < threshold) return null;

	const percent = formatPercent(tightest.usedPercent / 100);
	const label = t({ message: `Account usage: ${percent} used` });
	if (isCodex) {
		return (
			<span className="shrink-0 text-[10px] tabular-nums" title={label}>
				{percent}
			</span>
		);
	}

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

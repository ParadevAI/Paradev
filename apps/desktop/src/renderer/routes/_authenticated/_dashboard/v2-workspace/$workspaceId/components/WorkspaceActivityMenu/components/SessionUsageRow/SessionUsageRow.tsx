import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactNumber } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	type ContextWindowLevel,
	contextWindow,
} from "../../../../hooks/usePaneRegistry/components/ChatSession/components/Composer/utils/contextWindow";

const POLL_MS = 5_000;

const BAR_CLASS: Record<ContextWindowLevel, string> = {
	normal: "bg-muted-foreground/60",
	warning: "bg-warning",
	critical: "bg-destructive",
};

interface SessionUsageRowProps {
	workspaceId: string;
	terminalId: string;
	/** The session's pane title, shown when the workspace runs several. */
	source?: string;
	live: boolean;
}

function formatTokens(tokens: number): string {
	return formatCompactNumber(tokens, { maximumFractionDigits: 1 });
}

/**
 * Context window, tokens and estimated cost of one agent session, read from
 * the harness's own transcript. Polls while the panel is visible.
 */
export function SessionUsageRow({
	workspaceId,
	terminalId,
	source,
	live,
}: SessionUsageRowProps) {
	const { t } = useLingui();
	const query = workspaceTrpc.terminalAgents.sessionUsage.useQuery(
		{ workspaceId, terminalId },
		{
			refetchInterval: live ? POLL_MS : false,
			refetchOnWindowFocus: live,
			staleTime: 1_000,
		},
	);
	const usage = query.data;
	if (!usage) return null;
	const meter = contextWindow({
		contextUsed: usage.contextUsed,
		contextSize: usage.contextSize,
		costUsd: usage.costUsd,
	});
	const { used, size, percent } = meter;
	const input = formatTokens(usage.inputTokens);
	const output = formatTokens(usage.outputTokens);
	const cached = formatTokens(usage.cachedInputTokens);
	return (
		<div
			className="flex flex-col gap-1 rounded-sm px-2 py-1.5 text-xs"
			data-testid="session-usage-row"
		>
			<div className="flex items-center justify-between gap-2">
				<span className="min-w-0 truncate font-medium text-foreground">
					{source ?? usage.model}
				</span>
				{meter.cost && (
					<span
						className="shrink-0 tabular-nums text-muted-foreground"
						title={t({
							message: "Estimated at API list prices, not money spent",
						})}
					>
						~{meter.cost}
					</span>
				)}
			</div>
			{source && (
				<span className="truncate text-[11px] text-muted-foreground/70">
					{usage.model}
				</span>
			)}
			<div
				className="h-1 w-full overflow-hidden rounded-full bg-muted"
				aria-hidden="true"
			>
				<div
					className={cn(
						"h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
						BAR_CLASS[meter.level],
					)}
					style={{ width: `${meter.usedPercent}%` }}
				/>
			</div>
			<div className="flex items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
				<span>
					<Trans>
						Context {used} / {size} ({percent})
					</Trans>
				</span>
			</div>
			<div className="text-[11px] tabular-nums text-muted-foreground/80">
				<Trans>
					In {input} · Out {output} · Cached {cached}
				</Trans>
			</div>
		</div>
	);
}

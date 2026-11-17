import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { formatElapsed } from "@superset/i18n/format";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { cn } from "@superset/ui/utils";
import { Bot, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { useNestedItems } from "../../providers/NestedItemsProvider";
import { liveRunRows, subagentRunCard } from "../../utils/subagentRuns";
import { SubagentRunRow } from "./components/SubagentRunRow";
import { useRunContext } from "./hooks/useRunContext";

const COUNT_SWEEP_SECONDS = 1.6;

export function SubagentRunCard({
	launches,
	collapsed: collapsedOverride,
	onToggle,
}: {
	launches: readonly ToolCall[];
	collapsed?: ((defaultCollapsed: boolean) => boolean) | undefined;
	onToggle?: ((collapsed: boolean) => void) | undefined;
}) {
	const { t } = useLingui();
	const { stopTask } = useNestedItems();
	const context = useRunContext();
	const card = useMemo(
		() => subagentRunCard(launches, context),
		[launches, context],
	);
	const [localCollapsed, setLocalCollapsed] = useState<boolean | null>(null);
	const now = useNow(1000, card.live).getTime();
	const stoppable = liveRunRows(card.rows).filter((row) => row.canStop);

	if (card.rows.length === 1 && card.rows[0])
		return <SubagentRunRow row={card.rows[0]} />;

	const defaultCollapsed = !card.live;
	const collapsed =
		collapsedOverride?.(defaultCollapsed) ?? localCollapsed ?? defaultCollapsed;
	const toggle = () => {
		if (onToggle) onToggle(!collapsed);
		else setLocalCollapsed(!collapsed);
	};
	const { finished, failed, stopped } = card.counts;
	const running = card.counts.running + card.counts.waiting;
	const segments = card.live
		? [{ text: t`${running} running`, tone: "running" as const }]
		: [
				finished > 0 && { text: t`${finished} finished`, tone: null },
				failed > 0 && { text: t`${failed} failed`, tone: "failed" as const },
				stopped > 0 && { text: t`${stopped} stopped`, tone: null },
			].filter((segment) => segment !== false);
	const end = card.live ? now : card.endedAtMs;
	const elapsed =
		end !== null && (card.live || end - card.startedAtMs >= 1000)
			? formatElapsed(card.startedAtMs, end)
			: null;
	const stopAll = () => {
		if (!stopTask) return;
		for (const row of stoppable) void stopTask(row.itemId);
	};

	return (
		<div data-live={card.live || undefined} data-subagent-run-card>
			<div className="flex min-w-0 items-center gap-1.5">
				<button
					aria-expanded={!collapsed}
					className="group/phase flex min-w-0 items-center gap-1.5 py-1 text-left font-sans text-foreground/50 text-sm transition-colors duration-200 hover:text-foreground/80"
					onClick={toggle}
					type="button"
				>
					<span className="relative flex size-3.5 shrink-0 items-center justify-center">
						<Bot className="size-3.5 text-foreground/45 transition-opacity group-hover/phase:opacity-0" />
						<ChevronRight
							className={cn(
								"absolute size-3.5 text-foreground/45 opacity-0 transition group-hover/phase:opacity-100",
								!collapsed && "rotate-90",
							)}
						/>
					</span>
					<span className="shrink-0">
						{t({
							message: plural(card.rows.length, {
								one: "# subagent",
								other: "# subagents",
							}),
						})}
					</span>
					{segments.map((segment) => (
						<span
							className="flex shrink-0 items-center gap-1.5"
							key={segment.text}
						>
							<span aria-hidden="true">·</span>
							{segment.tone === "running" ? (
								<Shimmer duration={COUNT_SWEEP_SECONDS} variant="text">
									{segment.text}
								</Shimmer>
							) : (
								<span
									className={cn(
										segment.tone === "failed" && "text-destructive/80",
									)}
								>
									{segment.text}
								</span>
							)}
						</span>
					))}
					{elapsed && (
						<span className="flex shrink-0 items-center gap-1.5 tabular-nums">
							<span aria-hidden="true">·</span>
							{elapsed}
						</span>
					)}
				</button>
				{stoppable.length > 1 && stopTask && (
					<button
						className="shrink-0 rounded px-1 font-sans text-foreground/45 text-xs transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						onClick={stopAll}
						type="button"
					>
						<Trans>Stop all</Trans>
					</button>
				)}
			</div>
			{!collapsed && (
				<div className="pl-5">
					{card.rows.map((row) => (
						<SubagentRunRow key={row.itemId} row={row} />
					))}
				</div>
			)}
		</div>
	);
}

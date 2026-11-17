import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ToolCall } from "@superset/chat/protocol";
import { formatElapsed } from "@superset/i18n/format";
import { Shimmer } from "@superset/ui/ai-elements/shimmer";
import { cn } from "@superset/ui/utils";
import { ChevronRight, Square } from "lucide-react";
import { useMemo, useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import { useNestedItems } from "../../providers/NestedItemsProvider";
import { liveRunRows, subagentRunCard } from "../../utils/subagentRuns";
import { SubagentAvatarStack } from "./components/SubagentAvatar";
import { SubagentRunRow } from "./components/SubagentRunRow";
import { useRunContext } from "./hooks/useRunContext";

const COUNT_SWEEP_SECONDS = 1.6;
const HEADER_AVATAR_LIMIT = 3;

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

	const collapsed = collapsedOverride?.(true) ?? localCollapsed ?? true;
	const toggle = () => {
		if (onToggle) onToggle(!collapsed);
		else setLocalCollapsed(!collapsed);
	};
	const single = card.rows.length === 1 ? card.rows[0] : undefined;
	const { finished, failed, stopped } = card.counts;
	const running = card.counts.running + card.counts.waiting;
	const segments = card.live
		? [
				{
					text: single ? t({ message: "running" }) : t`${running} running`,
					tone: "running" as const,
				},
			]
		: [
				finished > 0 && {
					text: single ? t({ message: "finished" }) : t`${finished} finished`,
					tone: null,
				},
				failed > 0 && {
					text: single ? t({ message: "failed" }) : t`${failed} failed`,
					tone: "failed" as const,
				},
				stopped > 0 && {
					text: single ? t({ message: "stopped" }) : t`${stopped} stopped`,
					tone: null,
				},
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
	const avatars = card.rows
		.slice(0, HEADER_AVATAR_LIMIT)
		.map((row) => row.itemId);
	const hiddenAvatars = card.rows.length - avatars.length;

	return (
		<div data-live={card.live || undefined} data-subagent-run-card>
			<div className="flex min-w-0 items-center gap-1">
				<button
					aria-expanded={!collapsed}
					className="flex min-w-0 max-w-full items-center gap-1.5 py-1 text-left font-sans text-muted-foreground text-sm transition-colors duration-200 hover:text-foreground"
					onClick={toggle}
					type="button"
				>
					<span className="flex shrink-0 items-center gap-1">
						<SubagentAvatarStack seeds={avatars} />
						{hiddenAvatars > 0 && (
							<span className="text-xs tabular-nums">+{hiddenAvatars}</span>
						)}
					</span>
					<span className="min-w-0 truncate">
						{t({
							message: plural(card.rows.length, {
								one: "Created subagent",
								other: "Created # subagents",
							}),
						})}
						{single && (
							<span className="text-foreground/80">
								{" "}
								{single.name || t({ message: "Subagent" })}
							</span>
						)}
						{segments.map((segment) => (
							<span key={segment.text}>
								<span aria-hidden="true"> · </span>
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
							<span className="tabular-nums">
								<span aria-hidden="true"> · </span>
								{elapsed}
							</span>
						)}
					</span>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							"size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
							!collapsed && "rotate-90",
						)}
					/>
				</button>
				{card.live && stoppable.length > 0 && stopTask && (
					<button
						className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-sans text-foreground/80 text-xs transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
						onClick={stopAll}
						type="button"
					>
						<Square className="size-2.5 fill-current" />
						{stoppable.length > 1 ? (
							<Trans>Stop all</Trans>
						) : (
							<Trans>Stop</Trans>
						)}
					</button>
				)}
			</div>
			{!collapsed && (
				<div className="-mx-1.5 py-0.5">
					{card.rows.map((row) => (
						<SubagentRunRow key={row.itemId} row={row} />
					))}
				</div>
			)}
		</div>
	);
}

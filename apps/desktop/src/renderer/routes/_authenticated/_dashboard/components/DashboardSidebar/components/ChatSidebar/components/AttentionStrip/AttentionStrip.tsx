import { Trans } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuX } from "react-icons/lu";
import { StateDot } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/StateDot";
import type { ChatSidebarFilter } from "../../utils/attention";

interface AttentionStripProps {
	totals: { needsYou: number; running: number };
	filter: ChatSidebarFilter | null;
	onChange: (filter: ChatSidebarFilter | null) => void;
}

/**
 * Two counts over the lists: what waits on you, and what runs. Each one
 * narrows the rows below to its own; nothing shows while both are zero.
 */
export function AttentionStrip({
	totals,
	filter,
	onChange,
}: AttentionStripProps) {
	if (totals.needsYou === 0 && totals.running === 0 && filter === null) {
		return null;
	}
	const tile = (
		key: ChatSidebarFilter,
		count: number,
		label: ReactNode,
		state: "waiting" | "working",
	) => (
		<button
			type="button"
			aria-pressed={filter === key}
			onClick={() => onChange(filter === key ? null : key)}
			className={cn(
				"flex h-8 min-w-0 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors",
				filter === key
					? "border-foreground/20 bg-fill-selected text-foreground"
					: "border-border bg-background hover:bg-fill-hover",
			)}
		>
			<StateDot state={state} className={cn(count === 0 && "opacity-40")} />
			<span
				className={cn(
					"font-semibold tabular-nums",
					count === 0 && "text-muted-foreground",
				)}
			>
				{count}
			</span>
			<span
				className={cn(
					"truncate",
					filter === key ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
			{filter === key && (
				<LuX className="ml-auto size-3 shrink-0 text-muted-foreground" />
			)}
		</button>
	);
	return (
		<div className="grid grid-cols-2 gap-1.5 px-3">
			{tile("needsYou", totals.needsYou, <Trans>Needs you</Trans>, "waiting")}
			{tile("running", totals.running, <Trans>Running</Trans>, "working")}
		</div>
	);
}

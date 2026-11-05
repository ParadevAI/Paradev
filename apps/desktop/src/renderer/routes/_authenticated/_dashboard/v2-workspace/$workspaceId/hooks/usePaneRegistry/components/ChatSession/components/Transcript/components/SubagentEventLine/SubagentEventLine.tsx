import { Trans, useLingui } from "@lingui/react/macro";
import { subagentOutcome } from "@superset/chat/core";
import type { ToolCall } from "@superset/chat/protocol";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { cn } from "@superset/ui/utils";
import { Bot } from "lucide-react";
import { useNestedItems } from "../../providers/NestedItemsProvider";

const LABEL_SWEEP_SECONDS = 1.6;

export function SubagentEventLine({ item }: { item: ToolCall }) {
	const { t } = useLingui();
	const { openSubagent, moveToBackground } = useNestedItems();
	const name = item.title || t({ message: "Subagent" });
	const outcome = subagentOutcome(item);
	const running = outcome === "running";
	const label = running
		? t({ message: `${name} started working` })
		: outcome === "failed"
			? t({ message: `${name} failed` })
			: outcome === "stopped"
				? t({ message: `${name} stopped` })
				: t({ message: `${name} finished` });
	return (
		<div className="flex min-w-0 max-w-full items-center gap-2">
			<button
				className={cn(
					"flex min-w-0 items-center gap-1.5 rounded py-1 text-left font-sans text-sm transition-colors duration-200 hover:text-foreground/80 focus-visible:outline-2 focus-visible:outline-ring",
					outcome === "failed" ? "text-destructive/80" : "text-foreground/50",
				)}
				data-find-item={item.id}
				onClick={() => openSubagent(item.id)}
				type="button"
			>
				<Bot className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 truncate">
					<ShimmerLabel
						className="font-normal"
						duration={LABEL_SWEEP_SECONDS}
						isShimmering={running}
					>
						{label}
					</ShimmerLabel>
				</span>
			</button>
			{running && item.canBackground && moveToBackground && (
				<button
					aria-label={t({ message: `Move ${name} to background` })}
					className="shrink-0 rounded px-1 font-sans text-foreground/45 text-xs transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
					onClick={() => moveToBackground(item.id)}
					type="button"
				>
					<Trans>Move to background</Trans>
				</button>
			)}
		</div>
	);
}

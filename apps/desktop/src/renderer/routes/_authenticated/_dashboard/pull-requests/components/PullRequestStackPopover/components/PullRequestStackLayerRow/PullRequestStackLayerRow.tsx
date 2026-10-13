import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ArrowUpRight } from "lucide-react";
import type { PullRequestStackLayer } from "../../../../hooks/usePullRequestStack";
import {
	type PullRequestGlyphState,
	PullRequestStateGlyph,
} from "../../../PullRequestStateGlyph";

function layerGlyphState(layer: PullRequestStackLayer): PullRequestGlyphState {
	if (layer.state === "merged") return "merged";
	if (layer.state === "closed") return "closed";
	if (layer.isDraft) return "draft";
	if (layer.mergeable === "conflicting" || layer.mergeStateStatus === "DIRTY") {
		return "conflicting";
	}
	return layer.isQueued ? "queued" : "open";
}

export function PullRequestStackLayerRow({
	layer,
	onSelect,
}: {
	layer: PullRequestStackLayer;
	onSelect: (layer: PullRequestStackLayer) => void;
}) {
	const { t } = useLingui();
	const glyphState = layerGlyphState(layer);
	const stateLabels: Record<PullRequestGlyphState, string> = {
		open: t({ message: "Open", context: "status" }),
		draft: t({ message: "Draft" }),
		merged: t({ message: "Merged" }),
		closed: t({ message: "Closed" }),
		queued: t({ message: "Queued" }),
		conflicting: t({ message: "Has conflicts" }),
	};
	const stateLabel = stateLabels[glyphState];

	return (
		<div className="relative px-1.5">
			<span
				aria-hidden
				className="absolute left-[21.5px] top-[27px] h-[calc(100%-22px)] w-px bg-border"
			/>
			<button
				type="button"
				aria-current={layer.isCurrent ? "page" : undefined}
				className={cn(
					"group relative flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring",
					layer.isCurrent ? "bg-accent" : "hover:bg-accent/60",
				)}
				onClick={() => onSelect(layer)}
			>
				<span
					role="img"
					aria-label={stateLabel}
					title={stateLabel}
					className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
				>
					<PullRequestStateGlyph state={glyphState} className="size-4" />
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm leading-5 text-foreground">
						{layer.title}
					</span>
					<span className="block truncate text-xs leading-4 text-muted-foreground">
						#{layer.number} · {layer.headRefName}
					</span>
				</span>
				{layer.isCurrent ? null : (
					<ArrowUpRight
						aria-hidden
						strokeWidth={1.75}
						className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
					/>
				)}
			</button>
		</div>
	);
}

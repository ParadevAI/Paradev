import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { ArrowUpRight } from "lucide-react";
import type { PullRequestStackLayer } from "../../../../hooks/usePullRequestStack";
import { stackLayerGlyphState } from "../../../../utils/assessPullRequestStack";
import {
	PR_STATE_INK_CLASS_NAME,
	type PullRequestGlyphState,
	PullRequestStateGlyph,
} from "../../../PullRequestStateGlyph";
import { PR_RED_TEXT_CLASS_NAME } from "../../../pull-request-colors";

export type StackLayerStatusTone = "danger" | "warning" | "muted";

const STATUS_TONE_CLASS_NAME: Record<StackLayerStatusTone, string> = {
	danger: PR_RED_TEXT_CLASS_NAME,
	warning: PR_STATE_INK_CLASS_NAME.queued,
	muted: "text-muted-foreground",
};

export function PullRequestStackLayerRow({
	layer,
	tag,
	status,
	onSelect,
}: {
	layer: PullRequestStackLayer;
	/** Where this layer stands for the reader ("This workspace", "Viewing"). */
	tag: string | null;
	status: { label: string; tone: StackLayerStatusTone } | null;
	onSelect: (layer: PullRequestStackLayer) => void;
}) {
	const { t } = useLingui();
	const glyphState = stackLayerGlyphState(layer);
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
					<span
						className={cn(
							"block truncate text-sm leading-5",
							!layer.isCurrent && "pr-5",
							layer.state === "merged"
								? "text-muted-foreground"
								: "text-foreground",
						)}
					>
						{layer.title}
					</span>
					<span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
						<span className="truncate">
							#{layer.number} · {layer.headRefName}
						</span>
						{tag ? (
							<span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] leading-4">
								{tag}
							</span>
						) : null}
						{status ? (
							<span
								className={cn(
									"ml-auto shrink-0 pl-1",
									STATUS_TONE_CLASS_NAME[status.tone],
								)}
							>
								{status.label}
							</span>
						) : null}
					</span>
				</span>
				{layer.isCurrent ? null : (
					<ArrowUpRight
						aria-hidden
						strokeWidth={1.75}
						className="absolute right-2 top-2 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
					/>
				)}
			</button>
		</div>
	);
}

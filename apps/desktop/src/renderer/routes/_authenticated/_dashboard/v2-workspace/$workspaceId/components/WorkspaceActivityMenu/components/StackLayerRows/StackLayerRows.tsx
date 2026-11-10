import { cn } from "@superset/ui/utils";
import { PullRequestStateGlyph } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestStateGlyph";
import { PR_RED_TEXT_CLASS_NAME } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-colors";
import type { PullRequestStackLayer } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStack";
import { usePullRequestStackCopy } from "renderer/routes/_authenticated/_dashboard/pull-requests/hooks/usePullRequestStackCopy";
import {
	stackLayerGlyphState,
	stackLayerIssue,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/utils/assessPullRequestStack";

const DANGER_ISSUES = new Set(["closed", "conflicts", "changes_requested"]);

/** The other layers of the workspace's stack, top to bottom, under its row. */
export function StackLayerRows({
	layers,
	onSelect,
}: {
	layers: PullRequestStackLayer[];
	onSelect: (layer: PullRequestStackLayer) => void;
}) {
	const copy = usePullRequestStackCopy();
	return (
		<div className="ml-[1.625rem] border-l border-border/60 pl-2">
			{[...layers].reverse().map((layer) => {
				const status = copy.layerStatus(layer);
				const issue = stackLayerIssue(layer);
				return (
					<button
						key={layer.number}
						type="button"
						onClick={() => onSelect(layer)}
						className="flex min-h-6 w-full items-center gap-2 rounded-sm px-1.5 py-0.5 text-left text-[11px] outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
					>
						<PullRequestStateGlyph
							state={stackLayerGlyphState(layer)}
							className="size-3"
						/>
						<span className="shrink-0 text-muted-foreground tabular-nums">
							#{layer.number}
						</span>
						<span
							className={cn(
								"min-w-0 flex-1 truncate",
								layer.state === "merged"
									? "text-muted-foreground"
									: "text-foreground/90",
							)}
						>
							{layer.title}
						</span>
						{status ? (
							<span
								className={cn(
									"shrink-0",
									issue && DANGER_ISSUES.has(issue)
										? PR_RED_TEXT_CLASS_NAME
										: "text-muted-foreground",
								)}
							>
								{status}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

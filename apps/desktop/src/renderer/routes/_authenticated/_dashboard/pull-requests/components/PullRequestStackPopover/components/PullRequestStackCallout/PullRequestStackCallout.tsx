import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { LoaderCircle } from "lucide-react";
import { PR_STATE_INK_CLASS_NAME } from "../../../PullRequestStateGlyph";

/** One sentence about the stack, with the one action that answers it. */
export function PullRequestStackCallout({
	text,
	tone = "muted",
	action = null,
}: {
	text: string;
	/** `warning`: the stack is in a state the person should fix. */
	tone?: "muted" | "warning";
	action?: { label: string; run: () => void; isPending: boolean } | null;
}) {
	return (
		<div className="flex items-center gap-3 border-b border-border/60 py-2 pl-10 pr-3.5">
			<p
				className={cn(
					"min-w-0 flex-1 text-xs leading-4",
					tone === "warning"
						? PR_STATE_INK_CLASS_NAME.queued
						: "text-muted-foreground",
				)}
			>
				{text}
			</p>
			{action ? (
				<Button
					variant="outline"
					size="xs"
					className="h-6 shrink-0 gap-1.5 px-2 text-xs"
					disabled={action.isPending}
					aria-busy={action.isPending}
					onClick={action.run}
				>
					{action.isPending ? (
						<LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
					) : null}
					{action.label}
				</Button>
			) : null}
		</div>
	);
}

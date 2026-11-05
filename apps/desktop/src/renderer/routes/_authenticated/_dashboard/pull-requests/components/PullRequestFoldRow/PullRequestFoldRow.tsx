import { Trans } from "@lingui/react/macro";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { cn } from "@superset/ui/utils";
import { ChevronsUpDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { PullRequestTime } from "../../utils/describePullRequestTime";
import {
	type PullRequestActivityAuthor,
	pullRequestAuthorLabel,
} from "../../utils/pullRequestAuthorLabel";
import { PullRequestActivityAvatar } from "../PullRequestActivityAvatar";

interface PullRequestFoldRowProps {
	author: PullRequestActivityAuthor | null;
	/** Muted text after the name: a review state, a file path, "added 3 commits". */
	meta?: ReactNode;
	time?: PullRequestTime | null;
	className?: string;
	/** What the row unfolds to; without it the row is a plain line. */
	children?: ReactNode;
}

/** An activity item folded to one soft row for a narrow pane: who, what, when, and a toggle. */
export function PullRequestFoldRow({
	author,
	meta,
	time,
	className,
	children,
}: PullRequestFoldRowProps) {
	const [open, setOpen] = useState(false);
	const foldable = Boolean(children);
	return (
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className={cn(
				"min-w-0 rounded-lg bg-muted/50 [.dark_&]:bg-muted/30",
				className,
			)}
		>
			<CollapsibleTrigger
				disabled={!foldable}
				className="flex h-10 w-full min-w-0 items-center gap-2 px-3 text-left"
			>
				<PullRequestActivityAvatar author={author} />
				<span
					className="max-w-[50%] shrink-0 truncate text-sm font-medium text-foreground"
					title={author?.name ?? undefined}
				>
					{pullRequestAuthorLabel(author)}
				</span>
				<span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
					{meta}
				</span>
				{time ? (
					<time
						dateTime={time.iso}
						title={time.absolute}
						className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
					>
						{time.relative}
					</time>
				) : null}
				{foldable ? (
					<span className="flex shrink-0 items-center text-muted-foreground">
						<span className="sr-only">
							{open ? <Trans>Collapse</Trans> : <Trans>Expand</Trans>}
						</span>
						<ChevronsUpDown className="size-3.5" />
					</span>
				) : null}
			</CollapsibleTrigger>
			{foldable ? (
				<CollapsibleContent>
					<div className="min-w-0 border-t border-border/50 px-3 pb-3 pt-2">
						{children}
					</div>
				</CollapsibleContent>
			) : null}
		</Collapsible>
	);
}

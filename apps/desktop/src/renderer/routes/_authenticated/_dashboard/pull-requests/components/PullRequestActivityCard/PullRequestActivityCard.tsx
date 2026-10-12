import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { usePullRequestActivityLayout } from "../../providers/PullRequestActivityLayoutProvider";
import { describePullRequestTime } from "../../utils/describePullRequestTime";
import {
	type PullRequestActivityAuthor,
	pullRequestAuthorLabel,
} from "../../utils/pullRequestAuthorLabel";
import { PullRequestFoldRow } from "../PullRequestFoldRow";
import { PullRequestClampedBody } from "./components/PullRequestClampedBody";

interface PullRequestActivityCardProps {
	author: PullRequestActivityAuthor | null;
	/** Muted parts after the name, each behind a "·": a review state, a file
	 *  path, "Resolved". The header is one line; a part that may be long sets
	 *  `min-w-0 flex-1 truncate` and gives way to the rest. */
	meta?: ReactNode;
	createdAt?: string | null;
	/** Where the time links: the comment's own page on GitHub. */
	url?: string | null;
	/** Icon buttons and links at the header's right end. */
	actions?: ReactNode;
	/** Rendered under the body in their own bordered section. */
	replies?: ReactNode;
	footer?: ReactNode;
	className?: string;
	children?: ReactNode;
}

/**
 * A comment hung on the activity rail: a header line of who, what kind and
 * when, then the body folded past a scannable height. In a narrow pane the
 * same comment is one folded row that unfolds to the whole body.
 */
export function PullRequestActivityCard({
	author,
	meta,
	createdAt,
	url,
	actions,
	replies,
	footer,
	className,
	children,
}: PullRequestActivityCardProps) {
	const layout = usePullRequestActivityLayout();
	const time = describePullRequestTime(createdAt);
	const hasContent = Boolean(children || replies || footer);
	if (layout === "row") {
		return (
			<PullRequestFoldRow
				author={author}
				meta={meta}
				time={time}
				className={className}
			>
				{hasContent || actions ? (
					<>
						{actions ? (
							<div className="mb-1 flex items-center justify-end gap-0.5">
								{actions}
							</div>
						) : null}
						{children}
						{replies ? <div className="mt-2 min-w-0">{replies}</div> : null}
						{footer ? (
							<div className="mt-2 flex min-w-0 items-center justify-between gap-3">
								{footer}
							</div>
						) : null}
					</>
				) : null}
			</PullRequestFoldRow>
		);
	}
	return (
		<article
			className={cn(
				"min-w-0 overflow-hidden rounded-md border border-border/60 bg-muted/40 [.dark_&]:bg-muted/20",
				className,
			)}
		>
			<header
				className={cn(
					"flex min-h-9 min-w-0 items-start gap-2 px-3 py-1.5 text-xs text-muted-foreground",
					hasContent && "border-b border-border/60",
				)}
			>
				<div className="flex min-h-6 min-w-0 flex-1 items-center gap-x-2 [&>*+*]:before:me-2 [&>*+*]:before:text-muted-foreground [&>*+*]:before:content-['·']">
					<span
						className="min-w-0 max-w-[50%] shrink truncate font-medium text-foreground"
						title={author?.name ?? undefined}
					>
						{pullRequestAuthorLabel(author)}
					</span>
					{meta}
					{time && url ? (
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							title={time.absolute}
							className="shrink-0 transition-colors hover:text-foreground"
						>
							{time.relative}
						</a>
					) : time ? (
						<time
							dateTime={time.iso}
							title={time.absolute}
							className="shrink-0"
						>
							{time.relative}
						</time>
					) : null}
				</div>
				{actions ? (
					<div className="flex min-h-6 shrink-0 items-center gap-0.5">
						{actions}
					</div>
				) : null}
			</header>
			{children ? (
				<div className="min-w-0 px-3 py-2.5">
					<PullRequestClampedBody>{children}</PullRequestClampedBody>
				</div>
			) : null}
			{replies ? (
				<div className="min-w-0 border-t border-border/60 px-3">{replies}</div>
			) : null}
			{footer ? (
				<footer className="flex min-w-0 items-center justify-between gap-3 border-t border-border/60 px-2 py-1.5">
					{footer}
				</footer>
			) : null}
		</article>
	);
}

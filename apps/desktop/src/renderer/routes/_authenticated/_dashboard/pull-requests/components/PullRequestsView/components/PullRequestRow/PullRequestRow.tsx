import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";
import { useEffect, useRef } from "react";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { PullRequestChecksSummary } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestChecksSummary";
import { PullRequestSkeleton as Skeleton } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSkeleton";
import type { PullRequestCheck } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-checks";
import {
	PR_GREEN_TEXT_CLASS_NAME,
	PR_RED_TEXT_CLASS_NAME,
} from "renderer/routes/_authenticated/_dashboard/pull-requests/components/pull-request-colors";
import {
	normalizePRState,
	PRIcon,
} from "renderer/screens/main/components/PRIcon";

export interface PullRequestRowData {
	projectId: string;
	prNumber: number;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft: boolean;
	authorLogin: string | null;
	updatedAt: string | null;
	additions: number | null;
	deletions: number | null;
	headRefName: string | null;
	checks: PullRequestCheck[];
	/** Checks, diff stat and branch are still on their way. */
	detailsPending?: boolean;
	/** The values shown are the previous fetch's, kept while fresh ones load. */
	detailsCarried?: boolean;
}

interface PullRequestRowProps {
	pr: PullRequestRowData;
	repoSlug: string | undefined;
	isSelected: boolean;
	/** A request that will fill pending rows is running. */
	detailsLoading?: boolean;
	onClick: () => void;
	/** The pointer rested on the row, or it took focus: it is likely to be opened next. */
	onHoverIntent?: () => void;
}

const HOVER_INTENT_DELAY_MS = 300;

export function PullRequestRow({
	pr,
	repoSlug,
	isSelected,
	detailsLoading = false,
	onClick,
	onHoverIntent,
}: PullRequestRowProps) {
	const pending = !!pr.detailsPending;
	const showPlaceholders = pending && !pr.detailsCarried && detailsLoading;
	// Nothing left to confirm them, so the checks are unknown, not current.
	const checksUnknown = pending && !detailsLoading;
	const hoverIntentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cancelHoverIntent = () => {
		if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
		hoverIntentTimer.current = null;
	};
	const scheduleHoverIntent = () => {
		if (!onHoverIntent) return;
		cancelHoverIntent();
		hoverIntentTimer.current = setTimeout(onHoverIntent, HOVER_INTENT_DELAY_MS);
	};
	useEffect(
		() => () => {
			if (hoverIntentTimer.current) clearTimeout(hoverIntentTimer.current);
		},
		[],
	);
	const state = normalizePRState(pr.state, pr.isDraft);
	const hasDiffStat = pr.additions != null || pr.deletions != null;
	const parsedUpdatedAt = pr.updatedAt ? new Date(pr.updatedAt).getTime() : NaN;
	const updatedAtMs = Number.isNaN(parsedUpdatedAt) ? null : parsedUpdatedAt;

	return (
		// biome-ignore lint/a11y/useSemanticElements: row is a composite list item, not a native control
		<div
			className={cn(
				"flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
				isSelected && "bg-accent",
			)}
			onClick={onClick}
			onPointerEnter={scheduleHoverIntent}
			onPointerLeave={cancelHoverIntent}
			onFocus={(e) => {
				if (e.target === e.currentTarget) scheduleHoverIntent();
			}}
			onBlur={cancelHoverIntent}
			onKeyDown={(e) => {
				if (e.target !== e.currentTarget) return;
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			role="button"
			tabIndex={0}
			aria-current={isSelected ? "true" : undefined}
		>
			<PRIcon state={state} className="size-3.5 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-[13px] font-medium text-foreground">
					{pr.title}
				</span>
				<div className="flex min-w-0 items-center gap-2 text-muted-foreground/70">
					{pr.authorLogin && (
						<div className="flex shrink-0 items-center gap-1">
							<Avatar className="size-4 rounded-full ring-1 ring-border/50">
								<AvatarImage
									src={`https://github.com/${pr.authorLogin}.png?size=32`}
									alt={pr.authorLogin}
								/>
								<AvatarFallback className="text-[8px]">
									{pr.authorLogin.slice(0, 1).toUpperCase()}
								</AvatarFallback>
							</Avatar>
						</div>
					)}
					{repoSlug && (
						<span className="min-w-0 shrink-0 truncate text-[10px]">
							{repoSlug}
						</span>
					)}
					<span className="shrink-0 text-[10px] tabular-nums">
						#{pr.prNumber}
					</span>
					{showPlaceholders ? (
						<>
							<span className="shrink-0 text-[11px]">·</span>
							<Skeleton className="h-2.5 w-20 shrink rounded-full" />
						</>
					) : (
						pr.headRefName && (
							<>
								<span className="shrink-0 text-[11px]">·</span>
								<span className="min-w-0 truncate text-[11px]">
									{pr.headRefName}
								</span>
							</>
						)
					)}
				</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
				<div className="flex items-center gap-2">
					{showPlaceholders ? (
						<Skeleton className="size-3.5 rounded-full" />
					) : checksUnknown ? null : (
						<PullRequestChecksSummary checks={pr.checks} />
					)}
					{updatedAtMs != null && (
						<span>{formatRelativeTime(updatedAtMs)}</span>
					)}
				</div>
				{showPlaceholders ? (
					<Skeleton className="my-0.5 h-3 w-14 rounded-full" />
				) : (
					hasDiffStat && (
						<span className="flex items-center gap-1 tabular-nums">
							<span className={PR_GREEN_TEXT_CLASS_NAME}>
								+{pr.additions ?? 0}
							</span>
							<span className={PR_RED_TEXT_CLASS_NAME}>
								-{pr.deletions ?? 0}
							</span>
						</span>
					)
				)}
			</div>
		</div>
	);
}

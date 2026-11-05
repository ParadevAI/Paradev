import { cn } from "@superset/ui/utils";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import {
	PULL_REQUEST_COLOR,
	PULL_REQUEST_ICON,
	toPullRequestDisplayState,
} from "renderer/routes/_authenticated/_dashboard/utils/toPullRequestDisplayState";

interface CloudPullRequestRowProps {
	pullRequest: Omit<CloudPullRequest, "additions" | "deletions"> &
		Partial<Pick<CloudPullRequest, "additions" | "deletions">>;
	onOpen: () => void;
	/** Spans its container, pushing the +/- counts to the right edge. */
	fullWidth?: boolean;
}

export function CloudPullRequestRow({
	pullRequest,
	onOpen,
	fullWidth = false,
}: CloudPullRequestRowProps) {
	const state = toPullRequestDisplayState(pullRequest);
	const Icon = PULL_REQUEST_ICON[state];
	return (
		<button
			type="button"
			onClick={onOpen}
			className={cn(
				"flex h-7 max-w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-fill-hover",
				fullWidth ? "w-full" : "w-fit",
			)}
		>
			<Icon
				className={cn("size-3.5 shrink-0", PULL_REQUEST_COLOR[state])}
				strokeWidth={1.75}
			/>
			<span className="shrink-0 tabular-nums text-muted-foreground">
				#{pullRequest.number}
			</span>
			<span className={cn("min-w-0 truncate", fullWidth && "flex-1")}>
				{pullRequest.title}
			</span>
			{pullRequest.additions !== undefined &&
				pullRequest.deletions !== undefined && (
					<span className="shrink-0 font-mono text-[11px] tabular-nums">
						<span className="text-emerald-500">+{pullRequest.additions}</span>{" "}
						<span className="text-destructive">−{pullRequest.deletions}</span>
					</span>
				)}
		</button>
	);
}

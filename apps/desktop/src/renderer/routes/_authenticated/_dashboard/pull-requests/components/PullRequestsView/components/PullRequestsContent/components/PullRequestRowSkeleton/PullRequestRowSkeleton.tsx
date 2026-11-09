import { cn } from "@superset/ui/utils";
import { PullRequestSkeleton as Skeleton } from "renderer/routes/_authenticated/_dashboard/pull-requests/components/PullRequestSkeleton";

/** A PullRequestRow's shape while the first page loads. */
export function PullRequestRowSkeleton({ titleWidth }: { titleWidth: string }) {
	return (
		<div className="flex items-center gap-3 p-2" aria-hidden>
			<Skeleton className="size-3.5 shrink-0 rounded-full" />
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<Skeleton className={cn("h-3.5 rounded-full", titleWidth)} />
				<div className="flex items-center gap-2">
					<Skeleton className="size-4 shrink-0 rounded-full" />
					<Skeleton className="h-2.5 w-24 rounded-full" />
					<Skeleton className="h-2.5 w-10 rounded-full" />
				</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1.5">
				<Skeleton className="h-3 w-10 rounded-full" />
				<Skeleton className="h-3 w-14 rounded-full" />
			</div>
		</div>
	);
}

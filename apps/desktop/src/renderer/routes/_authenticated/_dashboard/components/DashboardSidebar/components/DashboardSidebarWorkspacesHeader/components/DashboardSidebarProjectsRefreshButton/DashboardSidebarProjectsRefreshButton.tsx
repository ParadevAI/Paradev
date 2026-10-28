import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useRef, useState } from "react";
import { VscRefresh } from "react-icons/vsc";

interface DashboardSidebarProjectsRefreshButtonProps {
	onRefresh: () => Promise<void>;
}

export function DashboardSidebarProjectsRefreshButton({
	onRefresh,
}: DashboardSidebarProjectsRefreshButtonProps) {
	const { t } = useLingui();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const refreshingRef = useRef(false);
	const handleRefresh = async () => {
		if (refreshingRef.current) return;
		refreshingRef.current = true;
		setIsRefreshing(true);
		try {
			await onRefresh();
		} catch {
			toast.error(t({ message: "Failed to refresh projects" }));
		} finally {
			refreshingRef.current = false;
			setIsRefreshing(false);
		}
	};

	return (
		<Tooltip delayDuration={700}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Refresh" })}
					aria-busy={isRefreshing}
					disabled={isRefreshing}
					onClick={(event) => {
						event.stopPropagation();
						void handleRefresh();
					}}
					onKeyDown={(event) => event.stopPropagation()}
					className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:opacity-50"
				>
					<VscRefresh
						className={cn(
							"size-3.5",
							isRefreshing && "animate-spin motion-reduce:animate-none",
						)}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				<Trans>Refresh</Trans>
			</TooltipContent>
		</Tooltip>
	);
}

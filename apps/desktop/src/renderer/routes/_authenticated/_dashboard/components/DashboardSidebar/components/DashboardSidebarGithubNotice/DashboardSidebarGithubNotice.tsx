import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuTriangleAlert } from "react-icons/lu";
import type { DashboardSidebarGithubHold } from "../../types";

interface DashboardSidebarGithubNoticeProps {
	status: DashboardSidebarGithubHold | null;
	isCollapsed: boolean;
}

/**
 * Says why PR chips stopped updating. The host keeps every existing link
 * through a GitHub rate limit, outage, or rejected credential but cannot
 * detect new pull requests, which otherwise reads as "PRs stopped showing
 * up" with nothing to explain it (SUPER-2107).
 */
export function DashboardSidebarGithubNotice({
	status,
	isCollapsed,
}: DashboardSidebarGithubNoticeProps) {
	const { formatDateTime } = useFormat();

	const { t } = useLingui();
	if (!status) return null;
	const until = formatDateTime(status.until, { timeStyle: "short" });
	const title = {
		"rate-limited": t({ message: "GitHub rate limit reached" }),
		unreachable: t({ message: "GitHub unreachable" }),
		auth: t({ message: "GitHub sign-in needed" }),
	}[status.reason];
	const host = status.isLocalHost
		? t({ message: "This machine" })
		: (status.hostName ?? status.machineId.slice(0, 8));
	const when =
		status.reason === "rate-limited"
			? t({ message: `Resets at ${until}` })
			: t({ message: `Retrying at ${until}` });
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={title}
					className={cn(
						"flex h-7 shrink-0 cursor-default items-center gap-2 rounded-md text-[13px] font-medium text-amber-600 dark:text-amber-400",
						isCollapsed
							? "mx-auto mt-1 w-8 justify-center"
							: "mx-2 mt-1 w-[calc(100%-1rem)] px-2 text-left",
					)}
				>
					<LuTriangleAlert className="size-4 shrink-0" strokeWidth={1.5} />
					{!isCollapsed && (
						<span className="min-w-0 flex-1 truncate">{title}</span>
					)}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="right"
				className="flex max-w-64 flex-col gap-0.5 px-2 py-1.5 text-wrap-pretty"
			>
				<span className="text-foreground">{title}</span>
				<span>
					{host} · {when}
				</span>
				{status.reason === "auth" && (
					<span>
						{t({ message: `Run "gh auth login" or set GITHUB_TOKEN` })}
					</span>
				)}
				{status.detail && (
					<span className="mt-1 line-clamp-3 font-mono text-[11px] font-normal opacity-70">
						{status.detail}
					</span>
				)}
			</TooltipContent>
		</Tooltip>
	);
}

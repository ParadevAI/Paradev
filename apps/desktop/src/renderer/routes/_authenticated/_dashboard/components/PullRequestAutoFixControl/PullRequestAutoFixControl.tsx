import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Switch } from "@superset/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LoaderCircle } from "lucide-react";
import { useId } from "react";
import { usePullRequestAutoFix } from "renderer/hooks/host-service/usePullRequestAutoFix";

interface PullRequestAutoFixControlProps {
	hostUrl: string | null;
	prNumber: number;
	/** Closed and merged PRs get no control. */
	isOpen: boolean;
	/** The workspace on the PR, when the caller knows it. */
	workspaceId?: string | null;
	/** Otherwise the host finds the workspace on the PR in this project. */
	projectId?: string | null;
	className?: string;
}

/**
 * The Auto-fix CI switch of one pull request and its status line. Shown only
 * for an open PR whose workspace on this host runs an agent, or that is
 * already watched.
 */
export function PullRequestAutoFixControl({
	hostUrl,
	prNumber,
	isOpen,
	workspaceId,
	projectId,
	className,
}: PullRequestAutoFixControlProps) {
	const { t } = useLingui();
	const switchId = useId();
	const { target, setEnabled, isPending } = usePullRequestAutoFix({
		hostUrl,
		prNumber,
		workspaceId,
		projectId,
		enabled: isOpen,
	});
	if (!isOpen || !target) return null;
	if (!target.watch && target.blocker !== null) return null;

	const { watch, maxAttempts } = target;
	const attempts = watch?.attempts ?? 0;
	let status: string | null = null;
	if (watch?.status === "watching") {
		status = target.hasAgent
			? t({ message: "Watching checks" })
			: t({ message: "Waiting for an agent in the workspace" });
	} else if (watch?.status === "fixing") {
		status = t({ message: `Fixing · attempt ${attempts} of ${maxAttempts}` });
	} else if (watch?.status === "paused") {
		status =
			watch.pauseReason === "attempt-limit"
				? t({
						message: `Paused: checks still failed after ${maxAttempts} fixes`,
					})
				: watch.pauseReason === "no-push"
					? t({ message: "Paused: the last fix did not push a commit" })
					: watch.pauseReason === "dispatch-interrupted"
						? t({ message: "Paused: the fix may not have reached the agent" })
						: t({ message: "Paused" });
	}

	return (
		<div className={cn("flex min-w-0 items-center gap-2 text-xs", className)}>
			<div className="flex min-w-0 flex-1 flex-col">
				<Tooltip>
					<TooltipTrigger asChild>
						<label htmlFor={switchId} className="w-fit text-foreground">
							<Trans>Auto-fix CI</Trans>
						</label>
					</TooltipTrigger>
					<TooltipContent side="bottom" className="max-w-64">
						<Trans>
							When checks fail on a new commit, the workspace's agent gets one
							fix at a time. It pauses after {maxAttempts} fixes without a green
							run and never merges.
						</Trans>
					</TooltipContent>
				</Tooltip>
				{status ? (
					<span
						className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground"
						title={status}
					>
						{watch?.status === "fixing" ? (
							<LoaderCircle className="size-3 shrink-0 animate-spin motion-reduce:animate-none" />
						) : null}
						<span className="truncate">{status}</span>
					</span>
				) : null}
			</div>
			{watch?.status === "paused" ? (
				<Button
					variant="ghost"
					size="xs"
					className="h-6 px-2 text-xs"
					disabled={isPending}
					onClick={() => setEnabled(true)}
				>
					<Trans>Resume</Trans>
				</Button>
			) : null}
			<Switch
				id={switchId}
				checked={watch !== null}
				disabled={isPending}
				onCheckedChange={setEnabled}
			/>
		</div>
	);
}

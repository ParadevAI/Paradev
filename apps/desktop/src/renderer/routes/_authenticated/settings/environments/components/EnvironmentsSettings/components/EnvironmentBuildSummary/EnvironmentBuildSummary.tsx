import { Trans } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { EnvironmentBuild } from "renderer/routes/_authenticated/utils/environmentBuildMeta";

interface EnvironmentBuildSummaryProps {
	build: EnvironmentBuild | null | undefined;
	hasSnapshot: boolean;
}

/** One line on the environments list: the state of the last build. */
export function EnvironmentBuildSummary({
	build,
	hasSnapshot,
}: EnvironmentBuildSummaryProps) {
	const dot =
		build?.status === "succeeded"
			? "bg-emerald-500"
			: build?.status === "failed"
				? "bg-destructive"
				: build?.status === "running"
					? "bg-sky-500 animate-pulse"
					: "bg-muted-foreground/40";
	return (
		<span className="flex w-44 shrink-0 items-center gap-2 text-xs text-muted-foreground">
			<span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
			{build?.status === "running" ? (
				<Trans>Building</Trans>
			) : build?.status === "failed" ? (
				<Trans>Last build failed</Trans>
			) : build?.status === "succeeded" ? (
				<Trans>
					Built{" "}
					{formatRelativeTime(new Date(build.finishedAt ?? build.startedAt))}
				</Trans>
			) : hasSnapshot ? (
				<Trans>Saved from a workspace</Trans>
			) : (
				<Trans>No builds yet</Trans>
			)}
		</span>
	);
}

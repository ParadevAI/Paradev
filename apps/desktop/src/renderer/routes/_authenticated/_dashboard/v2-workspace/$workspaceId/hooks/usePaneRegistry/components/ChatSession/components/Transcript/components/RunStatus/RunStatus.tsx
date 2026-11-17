import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { formatElapsed } from "@superset/i18n/format";
import { ShimmerLabel } from "@superset/ui/ai-elements/shimmer-label";
import { cn } from "@superset/ui/utils";
import { useNow } from "renderer/hooks/useNow";
import type { BackgroundShellStatus } from "../../utils/backgroundShell";
import type { RunPhase } from "../../utils/subagentRuns";

const STATUS_SWEEP_SECONDS = 1.6;
/** A replayed chat stamps a run's start and end at once, so a sub-second run says nothing. */
const MIN_SHOWN_MS = 1000;

export function RunStatus({
	status,
	startedAtMs,
	endedAtMs,
	exitCode = null,
	waitingOn = 0,
	className,
}: {
	status: RunPhase | BackgroundShellStatus;
	startedAtMs: number;
	endedAtMs: number | null;
	exitCode?: number | null;
	waitingOn?: number;
	className?: string;
}) {
	const { t } = useLingui();
	const live = status === "running" || status === "waiting";
	const now = useNow(1000, live).getTime();
	const end = live ? now : endedAtMs;
	const elapsed =
		end !== null &&
		status !== "stopped" &&
		(live || end - startedAtMs >= MIN_SHOWN_MS)
			? formatElapsed(startedAtMs, end)
			: null;
	const word =
		status === "running"
			? t({ message: "running" })
			: status === "waiting"
				? t({
						message: plural(waitingOn, {
							one: "waiting on # subagent",
							other: "waiting on # subagents",
						}),
					})
				: status === "finished"
					? t({ message: "finished" })
					: status === "stopped"
						? t({ message: "stopped" })
						: exitCode !== null
							? t({ message: `failed · exit ${exitCode}` })
							: t({ message: "failed" });
	const showElapsed =
		elapsed !== null && !(status === "failed" && exitCode !== null);
	return (
		<span
			className={cn(
				"flex shrink-0 items-center gap-1 tabular-nums",
				status === "failed" ? "text-destructive/80" : "text-foreground/45",
				className,
			)}
			data-run-status={status}
		>
			<ShimmerLabel
				className="font-normal"
				duration={STATUS_SWEEP_SECONDS}
				isShimmering={live}
			>
				{word}
			</ShimmerLabel>
			{showElapsed && (
				<>
					<span aria-hidden="true">·</span>
					<span>{elapsed}</span>
				</>
			)}
		</span>
	);
}

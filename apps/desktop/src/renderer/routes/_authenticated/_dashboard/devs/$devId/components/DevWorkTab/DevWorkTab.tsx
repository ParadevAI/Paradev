import { Trans, useLingui } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { LuCheck, LuX } from "react-icons/lu";

type Dev = RouterOutputs["agent"]["get"];

export function DevWorkTab({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	const reasons: Record<string, string> = {
		direct_message: t({ message: "Direct message" }),
		mention: t({ message: "Mentioned in a channel" }),
		thread_reply: t({ message: "Thread reply" }),
		dispatch: t({ message: "Picked by the channel" }),
		automation: t({ message: "Automation" }),
		schedule: t({ message: "Schedule" }),
		wake: t({ message: "Woke itself" }),
	};
	if (dev.recentTurns.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				<Trans>No work yet</Trans>
			</div>
		);
	}
	return (
		<div className="flex-1 overflow-y-auto p-4">
			<div className="flex flex-col gap-px">
				{dev.recentTurns.map((turn) => (
					<div
						key={turn.id}
						className="flex h-9 items-center gap-3 rounded-md px-2 text-[13px] hover:bg-fill-hover"
					>
						<span className="flex size-4 items-center justify-center">
							{turn.status === "running" ? (
								<WaveSpinner className="text-foreground/80" />
							) : turn.status === "completed" ? (
								<LuCheck className="size-3.5 text-green-500" />
							) : (
								<LuX className="size-3.5 text-muted-foreground" />
							)}
						</span>
						<span className="flex-1 truncate">
							{reasons[turn.reason] ?? turn.reason}
						</span>
						<span className="text-muted-foreground">
							{formatRelativeTime(new Date(turn.startedAt))}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";
import { LuCheck, LuX } from "react-icons/lu";
import { PanelRow } from "../PanelRow";

type Dev = RouterOutputs["agent"]["get"];

export function DevActivity({ dev }: { dev: Dev }) {
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
			<PanelRow
				label={
					<span className="text-muted-foreground">
						<Trans>Nothing yet</Trans>
					</span>
				}
			/>
		);
	}
	return dev.recentTurns.map((turn) => (
		<PanelRow
			key={turn.id}
			icon={
				turn.status === "running" ? (
					<WaveSpinner className="text-foreground/80" />
				) : turn.status === "completed" ? (
					<LuCheck className="size-3.5 text-green-500" />
				) : (
					<LuX className="size-3.5" />
				)
			}
			label={reasons[turn.reason] ?? turn.reason}
			trailing={formatCompactRelativeTime(new Date(turn.startedAt))}
		/>
	));
}

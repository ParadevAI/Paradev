import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { WaveSpinner } from "@superset/ui/atoms/WaveSpinner";

type Dev = RouterOutputs["agent"]["get"];

export function DevStatus({ dev }: { dev: Dev }) {
	const { t } = useLingui();
	if (dev.pausedAt) {
		return (
			<span className="text-[13px] text-muted-foreground">
				<Trans>Paused</Trans>
			</span>
		);
	}
	if (!dev.working) {
		return (
			<span className="text-[13px] text-muted-foreground">
				<Trans>Ready</Trans>
			</span>
		);
	}
	const doing: Record<string, string> = {
		direct_message: t({ message: "Replying to a DM" }),
		mention: t({ message: "Working on a mention" }),
		thread_reply: t({ message: "Replying in a thread" }),
	};
	return (
		<span className="flex items-center gap-1.5 text-[13px] text-foreground">
			<WaveSpinner className="text-foreground/80" />
			{doing[dev.working.reason] ?? t({ message: "Working" })}
		</span>
	);
}

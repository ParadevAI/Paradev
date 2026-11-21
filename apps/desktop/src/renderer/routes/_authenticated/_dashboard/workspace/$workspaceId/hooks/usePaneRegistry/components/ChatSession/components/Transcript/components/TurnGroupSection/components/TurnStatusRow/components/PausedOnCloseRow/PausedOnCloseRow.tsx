import { Trans } from "@lingui/react/macro";
import { QueueItemAction } from "@superset/ui/ai-elements/queue";
import { Pause, Play } from "lucide-react";
import { useTurnFailureActions } from "../../../../../../../../providers/TurnFailureActionsProvider";

export function PausedOnCloseRow({ latest }: { latest: boolean }) {
	const actions = useTurnFailureActions();
	const resumable = latest && actions !== null && !actions.blocked;
	return (
		<div
			className="flex items-center gap-1.5 text-muted-foreground text-xs"
			data-turn-paused-on-close
		>
			<Pause className="size-3.5 shrink-0" />
			<Trans>Paused when Paradev closed</Trans>
			{resumable && (
				<QueueItemAction
					className="ml-1 gap-1 px-1.5 py-0.5 font-normal text-xs opacity-100"
					onClick={actions.continueTask}
				>
					<Play className="size-3.5" />
					<Trans>Resume</Trans>
				</QueueItemAction>
			)}
		</div>
	);
}

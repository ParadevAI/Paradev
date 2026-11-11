import { useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import {
	setSendIntoRunningTurn,
	useSendIntoRunningTurn,
} from "renderer/hooks/useSendIntoRunningTurn";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";

export function SendIntoRunningTurnSetting({
	searchQuery,
}: {
	searchQuery: string;
}) {
	const { t } = useLingui();
	const enabled = useSendIntoRunningTurn();
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="send-into-running-turn" className="font-medium text-sm">
					<HighlightText
						text={t({ message: "Send while the agent works" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-muted-foreground text-xs">
					<HighlightText
						text={t({
							message:
								"In chat, Enter gives the message to the running turn and the agent reads it when it is ready. An agent that cannot take one keeps it in the queue, and ⌘↩ still interrupts the turn.",
						})}
						query={searchQuery}
					/>
				</p>
			</div>
			<Switch
				id="send-into-running-turn"
				checked={enabled}
				onCheckedChange={setSendIntoRunningTurn}
			/>
		</div>
	);
}

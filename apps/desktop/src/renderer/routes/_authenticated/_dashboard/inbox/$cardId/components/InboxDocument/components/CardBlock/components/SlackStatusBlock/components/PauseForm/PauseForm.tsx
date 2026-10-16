import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import type { CardBlockViewProps } from "../../../../types";
import { slackWhen, tomorrowMorning } from "../../../../utils/slackWhen";
import { MINUTE_MS } from "../../../../utils/zoneTime";
import { ActionButton } from "../../../ActionButton";
import { SlackDateTime } from "../../../SlackDateTime";
import { StripeField } from "../../../StripeField";
import { StripeRadio } from "../../../StripeRadio";
import {
	type PauseChoice,
	pauseChoiceOf,
	pauseTime,
} from "../../utils/clearAfter";

/** Slack's "Pause notifications" menu: for a while, until tomorrow, or until a time of the reader's own. */
export function PauseForm({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.status">) {
	const { t } = useLingui();
	const { current, proposed, timezone } = view;
	const proposedUntil = proposed.pauseUntil
		? Date.parse(proposed.pauseUntil)
		: null;
	const [choice, setChoice] = useState<PauseChoice>(() =>
		pauseChoiceOf(proposedUntil, Date.now(), timezone),
	);
	const [custom, setCustom] = useState(
		() => proposedUntil ?? tomorrowMorning(Date.now(), timezone),
	);
	const action = (id: string) => actions.find((entry) => entry.id === id);

	const now = Date.now();
	const until = pauseTime(choice, custom, now, timezone);
	const past = until < now + MINUTE_MS;
	const when = slackWhen(until, timezone);
	const pausedUntil = current.pausedUntil
		? slackWhen(Date.parse(current.pausedUntil), timezone)
		: null;

	if (done)
		return (
			<p className="px-4 py-3 text-[13px] text-foreground">
				<Trans>Pause notifications until {when}</Trans>
			</p>
		);

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-4 px-4 py-3">
				{pausedUntil && (
					<p className="text-[13px] text-foreground">
						<Trans>Notifications are paused until {pausedUntil}</Trans>
					</p>
				)}
				<StripeField label={<Trans>Pause notifications</Trans>}>
					<StripeRadio
						label={t({ message: "Pause notifications" })}
						value={choice}
						onChange={(next) => {
							if (next === "custom") setCustom(until);
							setChoice(next);
						}}
						disabled={pending}
						options={[
							{ value: "30m", label: t({ message: "For 30 minutes" }) },
							{ value: "1h", label: t({ message: "For 1 hour" }) },
							{ value: "2h", label: t({ message: "For 2 hours" }) },
							{ value: "tomorrow", label: t({ message: "Until tomorrow" }) },
							{
								value: "custom",
								label: t({ message: "Custom", context: "a pause time" }),
							},
						]}
					/>
					{choice === "custom" && (
						<SlackDateTime
							value={custom}
							timeZone={timezone}
							onChange={setCustom}
							dateLabel={t({ message: "Pause until date" })}
							timeLabel={t({ message: "Pause until time" })}
							disabled={pending}
							invalid={past}
						/>
					)}
					{view.stale && (
						<p className="text-xs text-muted-foreground">
							<Trans>The proposed time has passed</Trans>
						</p>
					)}
					{past && (
						<p className="text-xs text-destructive">
							<Trans>Pick a time in the future</Trans>
						</p>
					)}
				</StripeField>
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
				<ActionButton
					action={action("dismiss")}
					pending={pending}
					variant="outline"
					onClick={() => onAct("dismiss")}
				>
					<Trans>Leave it</Trans>
				</ActionButton>
				<ActionButton
					action={action("resume")}
					pending={pending}
					variant="outline"
					onClick={() => onAct("resume")}
				>
					<Trans>Resume notifications</Trans>
				</ActionButton>
				<ActionButton
					action={action("pause")}
					pending={pending}
					disabled={past}
					confirmText={t({
						message: `Pause your Slack notifications until ${when}?`,
					})}
					onClick={() =>
						onAct("pause", { until: new Date(until).toISOString() })
					}
				>
					<Trans>Pause notifications</Trans>
				</ActionButton>
			</div>
		</div>
	);
}

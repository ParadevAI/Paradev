import { Trans, useLingui } from "@lingui/react/macro";
import { useId, useState } from "react";
import type { CardBlockViewProps } from "../../types";
import { slackWhen, tomorrowMorning } from "../../utils/slackWhen";
import { ActionButton } from "../ActionButton";
import { SlackDateTime } from "../SlackDateTime";
import { StripeField } from "../StripeField";

const TEXT_MAX = 500;
const LEAD_MS = 30_000;

/** Slack's reminder dialog on a reminder the agent proposes: what it says and when Slackbot sends it. */
export function SlackReminderBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.reminder">) {
	const { t } = useLingui();
	const textId = useId();
	const { timezone } = view;
	const [text, setText] = useState(view.text);
	const [time, setTime] = useState(() =>
		view.time ? Date.parse(view.time) : tomorrowMorning(Date.now(), timezone),
	);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const past = time < Date.now() + LEAD_MS;
	const when = slackWhen(time, timezone);

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-4 px-4 py-3">
				<StripeField
					label={
						<label htmlFor={textId}>
							<Trans>Description</Trans>
						</label>
					}
				>
					{done ? (
						<p className="text-[13px] whitespace-pre-wrap text-foreground">
							{view.text}
						</p>
					) : (
						<textarea
							id={textId}
							value={text}
							disabled={pending}
							maxLength={TEXT_MAX}
							rows={2}
							onChange={(event) => setText(event.target.value)}
							className="resize-y rounded-md border border-input bg-background px-2 py-1.5 text-[13px] leading-relaxed text-foreground outline-none focus:border-foreground/40 disabled:opacity-50"
						/>
					)}
				</StripeField>
				<StripeField label={<Trans>When</Trans>}>
					{done ? (
						<span className="text-[13px] text-foreground">{when}</span>
					) : (
						<SlackDateTime
							value={time}
							timeZone={timezone}
							onChange={setTime}
							dateLabel={t({ message: "Reminder date" })}
							timeLabel={t({ message: "Reminder time" })}
							disabled={pending}
							invalid={past}
						/>
					)}
					{!done && view.stale && (
						<p className="text-xs text-muted-foreground">
							<Trans>The proposed time has passed</Trans>
						</p>
					)}
					{!done && past && (
						<p className="text-xs text-destructive">
							<Trans>Pick a time in the future</Trans>
						</p>
					)}
				</StripeField>
				<StripeField label={<Trans>Remind</Trans>}>
					<span className="text-[13px] text-foreground">
						<Trans context="the reminder goes to the reader">You</Trans>
					</span>
				</StripeField>
			</div>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{!done && (
				<div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
					<ActionButton
						action={action("dismiss")}
						pending={pending}
						variant="outline"
						onClick={() => onAct("dismiss")}
					>
						<Trans>No reminder</Trans>
					</ActionButton>
					<ActionButton
						action={action("remind")}
						pending={pending}
						disabled={text.trim() === "" || past}
						onClick={() =>
							onAct("remind", {
								text: text.trim(),
								time: new Date(time).toISOString(),
							})
						}
					>
						<Trans>Set reminder</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}

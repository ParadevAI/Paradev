import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useId, useState } from "react";
import { LuSmile } from "react-icons/lu";
import type { CardBlockViewProps } from "../../../../types";
import { slackEmojiChar } from "../../../../utils/slackEmoji";
import { slackWhen, tomorrowMorning } from "../../../../utils/slackWhen";
import { MINUTE_MS } from "../../../../utils/zoneTime";
import { ActionButton } from "../../../ActionButton";
import { EmojiPicker } from "../../../EmojiPicker";
import { SlackDateTime } from "../../../SlackDateTime";
import { EmojiGlyph } from "../../../SlackMessage/components/EmojiGlyph";
import { StripeField } from "../../../StripeField";
import { StripeSelect } from "../../../StripeSelect";
import {
	type ClearChoice,
	clearChoiceOf,
	clearTime,
} from "../../utils/clearAfter";
import { StatusLine } from "../StatusLine";

const TEXT_MAX = 100;

/** Slack's "Set a status" dialog: an emoji, the words, when it clears, and whether notifications pause with it. */
export function StatusForm({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"slack.status">) {
	const { t } = useLingui();
	const pauseId = useId();
	const { current, proposed, timezone } = view;
	const proposedUntil = proposed.until ? Date.parse(proposed.until) : null;
	const [emoji, setEmoji] = useState(proposed.emoji);
	const [text, setText] = useState(proposed.text);
	const [choice, setChoice] = useState<ClearChoice>(() =>
		clearChoiceOf(proposedUntil, Date.now(), timezone),
	);
	const [custom, setCustom] = useState(
		() => proposedUntil ?? tomorrowMorning(Date.now(), timezone),
	);
	const [pause, setPause] = useState(proposed.pause);
	const [picking, setPicking] = useState(false);
	const action = (id: string) => actions.find((entry) => entry.id === id);

	const now = Date.now();
	const until = clearTime(choice, custom, now, timezone);
	const past = until !== null && until < now + MINUTE_MS;
	const pausing = pause && until !== null;
	const name = emoji.replace(/^:|:$/g, "");
	const words = text.trim();
	const status = [name && (slackEmojiChar(name) ?? emoji), words]
		.filter(Boolean)
		.join(" ");
	const when = until === null ? null : slackWhen(until, timezone);
	const confirmText = !when
		? t({ message: `Set your Slack status to ${status}?` })
		: pausing
			? t({
					message: `Set your Slack status to ${status} until ${when} and pause notifications?`,
				})
			: t({ message: `Set your Slack status to ${status} until ${when}?` });

	if (done)
		return (
			<div className="px-4 py-3">
				<StatusLine
					emoji={proposed.emoji}
					text={proposed.text}
					until={proposed.until}
					timeZone={timezone}
					custom={view.emoji}
				/>
			</div>
		);

	return (
		<div className="flex flex-col">
			<div className="flex flex-col gap-4 px-4 py-3">
				{(current.text || current.emoji) && (
					<StripeField label={<Trans>Current status</Trans>}>
						<StatusLine
							emoji={current.emoji}
							text={current.text}
							until={current.until}
							timeZone={timezone}
							custom={view.emoji}
						/>
					</StripeField>
				)}
				<StripeField label={<Trans>Status</Trans>}>
					<div className="flex h-9 items-center gap-1 rounded-md border border-input bg-background pr-2 pl-1 focus-within:border-foreground/40">
						<Popover open={picking} onOpenChange={setPicking}>
							<PopoverTrigger asChild>
								<button
									type="button"
									disabled={pending}
									aria-label={t({ message: "Status emoji" })}
									className="flex size-7 shrink-0 items-center justify-center rounded-md text-base hover:bg-fill-hover disabled:opacity-50"
								>
									{name ? (
										<EmojiGlyph
											name={name}
											emoji={view.emoji}
											tooltip={false}
										/>
									) : (
										<LuSmile className="size-4 text-muted-foreground" />
									)}
								</button>
							</PopoverTrigger>
							<PopoverContent
								side="bottom"
								align="start"
								className="w-auto p-0"
							>
								<EmojiPicker
									emoji={view.emoji}
									onPick={({ reaction }) => {
										setEmoji(`:${reaction.split("::")[0]}:`);
										setPicking(false);
									}}
								/>
							</PopoverContent>
						</Popover>
						<input
							value={text}
							disabled={pending}
							maxLength={TEXT_MAX}
							aria-label={t({ message: "Status" })}
							placeholder={t({ message: "What's your status?" })}
							onChange={(event) => setText(event.target.value)}
							className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
						/>
					</div>
				</StripeField>
				<StripeField label={<Trans>Duration</Trans>}>
					<div className="flex flex-wrap items-center gap-2">
						<StripeSelect
							label={t({ message: "Duration" })}
							value={choice}
							onChange={(next) => {
								if (next === "custom" && until !== null) setCustom(until);
								setChoice(next);
							}}
							disabled={pending}
							options={[
								{ value: "never", label: t({ message: "Don't clear" }) },
								{ value: "30m", label: t({ message: "30 minutes" }) },
								{ value: "1h", label: t({ message: "1 hour" }) },
								{ value: "4h", label: t({ message: "4 hours" }) },
								{ value: "today", label: t({ message: "Today" }) },
								{ value: "week", label: t({ message: "This week" }) },
								{
									value: "custom",
									label: t({ message: "Choose date and time" }),
								},
							]}
						/>
						{choice === "custom" && (
							<SlackDateTime
								value={custom}
								timeZone={timezone}
								onChange={setCustom}
								dateLabel={t({ message: "Clear date" })}
								timeLabel={t({ message: "Clear time" })}
								disabled={pending}
								invalid={past}
							/>
						)}
					</div>
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
				<div className="flex items-center gap-2 text-[13px] text-foreground">
					<Checkbox
						id={pauseId}
						checked={pausing}
						disabled={pending || until === null}
						onCheckedChange={(checked) => setPause(checked === true)}
					/>
					<label
						htmlFor={pauseId}
						className={until === null ? "text-muted-foreground" : undefined}
					>
						<Trans>Pause notifications until status is cleared</Trans>
					</label>
				</div>
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
					action={action("clear_status")}
					pending={pending}
					variant="outline"
					onClick={() => onAct("clear_status")}
				>
					<Trans>Clear status</Trans>
				</ActionButton>
				<ActionButton
					action={action("set_status")}
					pending={pending}
					disabled={status === "" || past}
					confirmText={confirmText}
					onClick={() =>
						onAct("set_status", {
							text: words,
							emoji,
							until: until === null ? null : new Date(until).toISOString(),
							pause: pausing,
						})
					}
				>
					<Trans>Set status</Trans>
				</ActionButton>
			</div>
		</div>
	);
}

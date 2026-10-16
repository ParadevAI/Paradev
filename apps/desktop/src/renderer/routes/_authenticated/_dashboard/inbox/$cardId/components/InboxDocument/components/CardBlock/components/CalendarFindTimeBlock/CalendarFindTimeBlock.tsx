import { Trans, useLingui } from "@lingui/react/macro";
import { formatList, formatNumber } from "@superset/i18n/format";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { LuClock, LuUsers } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import type { CalendarSpan, CardBlockViewProps } from "../../types";
import { slotLine } from "../../utils/calendarTime";
import { ActionButton } from "../ActionButton";
import { LetterAvatar } from "../LetterAvatar";
import { byStart, SlotPicker } from "../SlotPicker";
import { AskSummary } from "./components/AskSummary";
import { PickedTimes } from "./components/PickedTimes";
import { offerText } from "./utils/offerText";

const SUGGESTED_PICKS = 3;
const NOW_TICK_MS = 60_000;

function lengthLabel(minutes: number): string {
	return minutes % 60 === 0
		? formatNumber(minutes / 60, { style: "unit", unit: "hour" })
		: formatNumber(minutes, { style: "unit", unit: "minute" });
}

/** Someone asked to meet: pick open times on the calendar, then reply with them or put the event on the calendar. */
export function CalendarFindTimeBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"google_calendar.find_time">) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const past = (time: CalendarSpan) => Date.parse(time.start) <= now.getTime();
	const [picked, setPicked] = useState<CalendarSpan[]>(() =>
		view.slots.slice(0, SUGGESTED_PICKS),
	);
	const [reply, setReply] = useState(view.reply);
	const offer = actions.find((action) => action.id === "offer");
	const create = actions.find((action) => action.id === "create_event");
	const times = [...picked].sort(byStart);
	const only = times.length === 1 ? times[0] : undefined;
	const createEvent = (time: CalendarSpan) =>
		onAct("create_event", { ...time, title: view.title });

	return (
		<div className="flex flex-col">
			<AskSummary ask={view.ask} />
			<div className="flex flex-col gap-3 px-4 py-4">
				<div className="flex flex-col gap-1.5">
					<h3 className="text-[17px] leading-snug text-foreground">
						{view.title}
					</h3>
					<div className="flex items-center gap-2 text-[13px] text-muted-foreground">
						<LuClock aria-hidden className="size-4" strokeWidth={1.5} />
						{lengthLabel(view.minutes)}
					</div>
					{view.guests.length > 0 && (
						<div className="flex items-start gap-2 text-[13px] text-foreground">
							<LuUsers
								aria-hidden
								className="mt-1 size-4 shrink-0 text-muted-foreground"
								strokeWidth={1.5}
							/>
							<ul className="flex flex-wrap gap-x-3 gap-y-1.5">
								{view.guests.map((guest) => (
									<li key={guest.email} className="flex items-center gap-1.5">
										<LetterAvatar
											address={guest}
											className="size-5 text-[11px]"
										/>
										{guest.name ?? guest.email}
										{guest.inThread === false && (
											<span className="text-xs text-muted-foreground">
												<Trans>Not on this thread</Trans>
											</span>
										)}
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
				{!done && (offer || create) && (
					<>
						<SlotPicker
							window={view.window}
							timeZone={view.timeZone}
							busy={view.busy}
							guestsBusy={view.guestsBusy}
							slots={view.slots}
							minutes={view.minutes}
							value={picked}
							onChange={setPicked}
							mode="multiple"
							disabled={pending}
						/>
						{offer && view.ask.replyTo.length > 0 && (
							<p className="text-xs text-muted-foreground">
								<Trans>To</Trans> {formatList(view.ask.replyTo)}
							</p>
						)}
						{offer && (
							<Textarea
								value={reply}
								onChange={(event) => setReply(event.target.value)}
								disabled={pending || !view.canReply}
								aria-label={t({ message: "Reply" })}
								className="min-h-20 text-[13px] md:text-[13px]"
							/>
						)}
						<PickedTimes
							times={times}
							timeZone={view.timeZone}
							create={times.length > 1 ? create : undefined}
							pending={pending}
							past={past}
							onCreate={createEvent}
						/>
					</>
				)}
				{failure && (
					<p role="alert" className="text-xs text-destructive">
						{failure}
					</p>
				)}
				{!done && (offer || create) && (
					<div className="flex flex-wrap justify-end gap-2">
						{only && (
							<ActionButton
								action={create}
								pending={pending}
								variant="outline"
								disabled={past(only)}
								onClick={() => createEvent(only)}
							>
								<Trans>Create event</Trans>
							</ActionButton>
						)}
						<ActionButton
							action={offer}
							pending={pending}
							disabled={times.length === 0 || !view.canReply}
							onClick={() =>
								onAct("offer", {
									slots: times,
									version: view.ask.version,
									text: offerText(
										reply,
										times.map((time) => slotLine(time, view.timeZone)),
									),
								})
							}
						>
							<Trans>Send reply</Trans>
						</ActionButton>
					</div>
				)}
			</div>
		</div>
	);
}

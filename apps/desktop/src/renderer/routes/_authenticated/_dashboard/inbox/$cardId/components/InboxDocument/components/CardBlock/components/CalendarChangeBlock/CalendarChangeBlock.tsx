import { Trans, useLingui } from "@lingui/react/macro";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { useNow } from "renderer/hooks/useNow";
import type { CalendarSpan, CardBlockViewProps } from "../../types";
import { ActionButton } from "../ActionButton";
import { CalendarConflicts } from "../CalendarConflicts";
import { CalendarEventFacts } from "../CalendarEventFacts";
import { CalendarTimeEditor } from "../CalendarTimeEditor";
import { overlaps, sameSpan } from "../SlotPicker";

const NOW_TICK_MS = 60_000;

/** An event the reader owns that the agent wants moved or cancelled, with the note Google sends the guests. */
export function CalendarChangeBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"google_calendar.change">) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const { event } = view;
	const [span, setSpan] = useState<CalendarSpan>(
		() => view.proposal ?? { start: event.start, end: event.end },
	);
	const [note, setNote] = useState(view.note);
	const action = (id: string) => actions.find((entry) => entry.id === id);
	const changing = !done;
	const moving = view.change === "reschedule";
	const valid =
		Date.parse(span.end) > Date.parse(span.start) &&
		Date.parse(span.start) > now.getTime() &&
		!sameSpan(span, event);
	const noteLabel = moving
		? t({ message: "Add an optional message for all guests" })
		: t({ message: "Add an optional message for cancellations" });
	const noteBlocked = t({ message: "Reconnect Google to email a note" });
	const conflicts =
		view.proposal && sameSpan(span, view.proposal)
			? view.conflicts
			: view.busy.filter(
					(entry) =>
						entry.id !== event.id &&
						entry.response !== "declined" &&
						overlaps(entry, span),
				);
	const withNote =
		view.canEmailNote && note.trim() ? { note: note.trim() } : {};

	return (
		<div className="flex flex-col">
			<CalendarEventFacts event={event} />
			{changing && (
				<div className="flex flex-col gap-3 border-t border-border px-4 py-4">
					{moving && (
						<CalendarTimeEditor
							event={event}
							label={<Trans>New event time:</Trans>}
							value={span}
							onChange={setSpan}
							busy={view.busy}
							window={view.window}
							disabled={pending || !view.canChange}
						>
							<CalendarConflicts
								conflicts={conflicts}
								timeZone={event.timeZone}
							/>
						</CalendarTimeEditor>
					)}
					{view.canEmailNote ? (
						<Textarea
							value={note}
							onChange={(e) => setNote(e.target.value)}
							disabled={pending || !view.canChange}
							placeholder={noteLabel}
							aria-label={noteLabel}
							className="min-h-20 text-[13px] md:text-[13px]"
						/>
					) : (
						<div className="flex flex-col gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									<span>
										<Textarea
											value={note}
											disabled
											readOnly
											placeholder={noteLabel}
											aria-label={noteLabel}
											className="min-h-20 text-[13px] md:text-[13px]"
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent side="top">{noteBlocked}</TooltipContent>
							</Tooltip>
							<p className="text-xs text-muted-foreground">{noteBlocked}</p>
						</div>
					)}
					{failure && (
						<p role="alert" className="text-xs text-destructive">
							{failure}
						</p>
					)}
					<div className="flex flex-wrap justify-end gap-2">
						<ActionButton
							action={action("keep")}
							pending={pending}
							variant="outline"
							onClick={() => onAct("keep")}
						>
							{moving ? <Trans>Keep as is</Trans> : <Trans>Keep event</Trans>}
						</ActionButton>
						{moving ? (
							<ActionButton
								action={action("reschedule")}
								pending={pending}
								disabled={!valid}
								onClick={() => onAct("reschedule", { ...span, ...withNote })}
							>
								<Trans>Reschedule</Trans>
							</ActionButton>
						) : (
							<ActionButton
								action={action("cancel")}
								pending={pending}
								variant="destructive"
								dismissLabel={<Trans>Keep event</Trans>}
								onClick={() => onAct("cancel", withNote)}
							>
								<Trans>Cancel event</Trans>
							</ActionButton>
						)}
					</div>
				</div>
			)}
			{!changing && failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
		</div>
	);
}

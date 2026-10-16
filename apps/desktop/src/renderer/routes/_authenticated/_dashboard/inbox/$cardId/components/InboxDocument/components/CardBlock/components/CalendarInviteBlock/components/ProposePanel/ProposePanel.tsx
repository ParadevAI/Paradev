import { Trans, useLingui } from "@lingui/react/macro";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { LuX } from "react-icons/lu";
import { useNow } from "renderer/hooks/useNow";
import type {
	CalendarAnswer,
	CalendarBusyView,
	CalendarEventView,
	CalendarSpan,
	CardAction,
} from "../../../../types";
import { ActionButton } from "../../../ActionButton";
import { CalendarConflicts } from "../../../CalendarConflicts";
import { CalendarTimeEditor } from "../../../CalendarTimeEditor";
import { overlaps, sameSpan } from "../../../SlotPicker";
import { ResponseSelect } from "../ResponseSelect";

interface ProposePanelProps {
	event: CalendarEventView;
	busy: CalendarBusyView[];
	window: CalendarSpan;
	/** The note the agent drafted, if any. */
	note: string;
	/** False when the message goes on the answer alone, with no email to the organizer. */
	organizerEmailed: boolean;
	action: CardAction | undefined;
	pending: boolean;
	onSend: (
		input: CalendarSpan & { response: CalendarAnswer; note?: string },
	) => void;
	onClose: () => void;
}

const NOW_TICK_MS = 60_000;

/** Google's "Propose a new time": another time for the event, sent to the organizer with an answer. */
export function ProposePanel({
	event,
	busy,
	window,
	note,
	organizerEmailed,
	action,
	pending,
	onSend,
	onClose,
}: ProposePanelProps) {
	const { t } = useLingui();
	const now = useNow(NOW_TICK_MS);
	const [span, setSpan] = useState<CalendarSpan>({
		start: event.start,
		end: event.end,
	});
	const [response, setResponse] = useState<CalendarAnswer>("tentative");
	const [message, setMessage] = useState(note);
	const valid =
		Date.parse(span.end) > Date.parse(span.start) &&
		Date.parse(span.start) > now.getTime() &&
		!sameSpan(span, event);
	const conflicts = busy.filter(
		(entry) =>
			entry.id !== event.id &&
			entry.response !== "declined" &&
			overlaps(entry, span),
	);
	return (
		<div className="flex flex-col gap-3 border-t border-border px-4 py-4">
			<div className="flex items-center justify-between">
				<h4 className="text-[14px] font-medium text-foreground">
					<Trans>Propose a new time</Trans>
				</h4>
				<button
					type="button"
					onClick={onClose}
					aria-label={t({ message: "Close" })}
					className="rounded-md p-1.5 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<LuX className="size-4" />
				</button>
			</div>
			<CalendarTimeEditor
				event={event}
				label={<Trans>Your proposal:</Trans>}
				value={span}
				onChange={setSpan}
				busy={busy}
				window={window}
				disabled={pending}
				before={
					<ResponseSelect
						value={response}
						onChange={setResponse}
						disabled={pending}
					/>
				}
			>
				<Textarea
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					disabled={pending}
					placeholder={t({ message: "Add optional message" })}
					aria-label={t({ message: "Add optional message" })}
					className="min-h-20 text-[13px] md:text-[13px]"
				/>
				{!organizerEmailed && (
					<p className="text-xs text-muted-foreground">
						<Trans>Reconnect Google to email a note</Trans>
					</p>
				)}
				<CalendarConflicts conflicts={conflicts} timeZone={event.timeZone} />
				<div className="flex justify-end">
					<ActionButton
						action={action}
						pending={pending}
						disabled={!valid}
						onClick={() =>
							onSend({
								...span,
								response,
								...(message.trim() ? { note: message.trim() } : {}),
							})
						}
					>
						<Trans>Send proposal</Trans>
					</ActionButton>
				</div>
			</CalendarTimeEditor>
		</div>
	);
}

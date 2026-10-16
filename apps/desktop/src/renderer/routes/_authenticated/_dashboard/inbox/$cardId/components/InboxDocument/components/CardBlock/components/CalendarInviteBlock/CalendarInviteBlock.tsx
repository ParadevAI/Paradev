import { useState } from "react";
import type { CalendarAnswer, CardBlockViewProps } from "../../types";
import { CalendarConflicts } from "../CalendarConflicts";
import { CalendarEventFacts } from "../CalendarEventFacts";
import { NoteDialog } from "./components/NoteDialog";
import { ProposePanel } from "./components/ProposePanel";
import { RsvpFooter } from "./components/RsvpFooter";

/** An invitation as Google Calendar's event popover, answered from its "Going?" footer. */
export function CalendarInviteBlock({
	view,
	actions,
	done,
	pending,
	failure,
	onAct,
}: CardBlockViewProps<"google_calendar.invite">) {
	const [proposing, setProposing] = useState(false);
	const [noting, setNoting] = useState(false);
	const rsvp = actions.find((action) => action.id === "rsvp");
	const propose = actions.find((action) => action.id === "propose");
	const answering = !done && view.canRespond;
	const refused = !done && !view.canRespond;
	return (
		<div className="flex flex-col">
			<CalendarEventFacts event={view.event}>
				<CalendarConflicts
					conflicts={view.conflicts}
					timeZone={view.event.timeZone}
				/>
			</CalendarEventFacts>
			{failure && (
				<p role="alert" className="px-4 pb-3 text-xs text-destructive">
					{failure}
				</p>
			)}
			{answering && proposing && (
				<ProposePanel
					event={view.event}
					busy={view.busy}
					window={view.window}
					note={view.note}
					organizerEmailed={view.canEmailNote}
					action={propose}
					pending={pending}
					onSend={(input) => onAct("propose", { ...input })}
					onClose={() => setProposing(false)}
				/>
			)}
			{(done || refused || (answering && !proposing)) && (
				<RsvpFooter
					response={view.response}
					rsvp={rsvp}
					propose={propose}
					pending={pending || refused}
					answered={done}
					onRsvp={(response: CalendarAnswer) => onAct("rsvp", { response })}
					onPropose={() => setProposing(true)}
					onNote={() => setNoting(true)}
				/>
			)}
			{answering && noting && (
				<NoteDialog
					note={view.note}
					response={view.response === "needsAction" ? null : view.response}
					onSend={(input) => {
						setNoting(false);
						onAct("rsvp", input);
					}}
					onCancel={() => setNoting(false)}
				/>
			)}
		</div>
	);
}

import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import type { CalendarAnswer } from "../../../../types";
import { ResponseSelect } from "../ResponseSelect";

interface NoteDialogProps {
	/** The note the agent drafted, if any. */
	note: string;
	/** The reader's current answer; null when they have not answered. */
	response: CalendarAnswer | null;
	onSend: (input: { response: CalendarAnswer; note: string }) => void;
	onCancel: () => void;
}

/** Google's "Add a note": a note to the organizer sent with the answer. */
export function NoteDialog({
	note,
	response,
	onSend,
	onCancel,
}: NoteDialogProps) {
	const { t } = useLingui();
	const [text, setText] = useState(note);
	const [answer, setAnswer] = useState(response);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogContent className="sm:max-w-md" aria-describedby={undefined}>
				<DialogHeader>
					<DialogTitle>
						<Trans>Add a note</Trans>
					</DialogTitle>
				</DialogHeader>
				<Textarea
					autoFocus
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder={t({ message: "Add a note" })}
					aria-label={t({ message: "Add a note" })}
					className="min-h-28 text-[13px] md:text-[13px]"
				/>
				<ResponseSelect value={answer} onChange={setAnswer} />
				<DialogFooter>
					<Button type="button" variant="ghost" onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						type="button"
						disabled={!answer || text.trim() === ""}
						onClick={() => {
							if (answer) onSend({ response: answer, note: text.trim() });
						}}
					>
						<Trans>Send</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

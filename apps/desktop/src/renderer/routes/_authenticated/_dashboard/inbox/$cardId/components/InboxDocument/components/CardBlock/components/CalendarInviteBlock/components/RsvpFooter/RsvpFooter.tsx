import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import type {
	CalendarAnswer,
	CalendarResponse,
	CardAction,
} from "../../../../types";
import type { ActionKeySlot } from "../../../../utils/assignActionKeys";
import { ActionButton } from "../../../ActionButton";

const PILL = "rounded-full px-4";

interface RsvpFooterProps {
	response: CalendarResponse;
	rsvp: CardAction | undefined;
	propose: CardAction | undefined;
	pending: boolean;
	/** The card is answered, so the footer only shows which answer was given. */
	answered?: boolean;
	onRsvp: (response: CalendarAnswer) => void;
	onPropose: () => void;
	onNote: () => void;
}

/** Google's invite footer: "Going?" with Yes, No and Maybe, and a chevron that opens the two slower answers. */
export function RsvpFooter({
	response,
	rsvp,
	propose,
	pending,
	answered,
	onRsvp,
	onPropose,
	onNote,
}: RsvpFooterProps) {
	const { t } = useLingui();
	const [more, setMore] = useState(false);
	const answers: {
		value: CalendarAnswer;
		label: string;
		key: ActionKeySlot;
	}[] = [
		{ value: "accepted", label: t({ message: "Yes" }), key: "primary" },
		{ value: "declined", label: t({ message: "No" }), key: "dismiss" },
		{ value: "tentative", label: t({ message: "Maybe" }), key: "1" },
	];
	return (
		<div className="flex flex-col gap-3 border-t border-border bg-muted/30 px-4 py-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="mr-auto text-[13px] text-foreground">
					<Trans>Going?</Trans>
				</span>
				{answers.map((answer) => (
					<ActionButton
						key={answer.value}
						action={rsvp}
						pending={pending || Boolean(answered)}
						variant="outline"
						keySlot={answer.key}
						aria-pressed={response === answer.value}
						onClick={() => onRsvp(answer.value)}
						className={cn(
							PILL,
							response === answer.value &&
								"border-primary bg-primary/15 text-foreground hover:bg-primary/20 disabled:opacity-100 dark:border-primary dark:bg-primary/15 dark:hover:bg-primary/20",
						)}
					>
						{answer.label}
					</ActionButton>
				))}
				{!answered && (
					<>
						<span aria-hidden className="mx-1 h-5 w-px bg-border" />
						<button
							type="button"
							aria-expanded={more}
							aria-label={
								more
									? t({ message: "Fewer options" })
									: t({ message: "More options" })
							}
							onClick={() => setMore(!more)}
							className="rounded-full p-1.5 text-muted-foreground hover:bg-fill-hover hover:text-foreground"
						>
							{more ? (
								<LuChevronUp className="size-4" />
							) : (
								<LuChevronDown className="size-4" />
							)}
						</button>
					</>
				)}
			</div>
			{more && !answered && (
				<div className="flex flex-wrap justify-end gap-2">
					<ActionButton
						action={propose}
						pending={pending}
						variant="outline"
						keySlot="2"
						onClick={onPropose}
						className={PILL}
					>
						<Trans>Propose a new time</Trans>
					</ActionButton>
					<ActionButton
						action={rsvp}
						pending={pending}
						variant="outline"
						keySlot="3"
						onClick={onNote}
						className={PILL}
					>
						<Trans>Add note</Trans>
					</ActionButton>
				</div>
			)}
		</div>
	);
}

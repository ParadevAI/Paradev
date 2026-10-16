import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuCheck, LuX } from "react-icons/lu";
import type { CalendarGuestView } from "../../../../../../types";
import { LetterAvatar } from "../../../../../LetterAvatar";

interface GuestRowProps {
	guest: CalendarGuestView;
}

/** A guest as Google lists them: the avatar with their answer on it, and who they are to the event under the name. */
export function GuestRow({ guest }: GuestRowProps) {
	const { t } = useLingui();
	const answer = {
		accepted: {
			label: t({ message: "Yes" }),
			tone: "bg-success text-background",
			mark: <LuCheck className="size-2.5" strokeWidth={3} />,
		},
		declined: {
			label: t({ message: "No" }),
			tone: "bg-destructive text-background",
			mark: <LuX className="size-2.5" strokeWidth={3} />,
		},
		tentative: {
			label: t({ message: "Maybe" }),
			tone: "bg-muted-foreground text-background",
			mark: <span className="text-[9px] font-bold leading-none">?</span>,
		},
		needsAction: null,
	}[guest.response];
	return (
		<li className="flex items-start gap-2.5" data-response={guest.response}>
			<span className="relative shrink-0">
				<LetterAvatar
					address={guest}
					photo={guest.photo}
					className="size-6 text-xs"
				/>
				{answer && (
					<span
						role="img"
						aria-label={answer.label}
						className={cn(
							"absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full ring-2 ring-card",
							answer.tone,
						)}
					>
						{answer.mark}
					</span>
				)}
			</span>
			<span className="flex min-w-0 flex-col pt-0.5 text-[13px] leading-tight">
				<span className="truncate text-foreground">
					{guest.name ?? guest.email}
				</span>
				{guest.organizer && (
					<span className="text-xs text-muted-foreground">
						<Trans>Organizer</Trans>
					</span>
				)}
				{guest.optional && (
					<span className="text-xs text-muted-foreground">
						<Trans>Optional</Trans>
					</span>
				)}
				{guest.comment && (
					<span className="whitespace-pre-line text-xs text-muted-foreground">
						{guest.comment}
					</span>
				)}
			</span>
		</li>
	);
}

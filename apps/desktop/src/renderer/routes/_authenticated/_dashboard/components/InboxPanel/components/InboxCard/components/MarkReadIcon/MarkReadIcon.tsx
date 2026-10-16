import { cn } from "@superset/ui/utils";

interface MarkReadIconProps {
	/** True draws the check (the card is unread, the action marks it read); false draws the dot. */
	unread: boolean;
	className?: string;
}

/** A card outline open at its top-right corner, with a check or an unread dot in the gap. */
export function MarkReadIcon({ unread, className }: MarkReadIconProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			role="presentation"
			className={cn("size-3.5", className)}
		>
			<path d="M12 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
			{unread ? (
				<path d="m15 7 2 2 4-5" />
			) : (
				<circle cx="18" cy="6" r="2.25" fill="currentColor" stroke="none" />
			)}
		</svg>
	);
}

import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import type { ChannelPerson } from "../ChannelMessageRow";
import { PersonHoverCard } from "../PersonHoverCard";

interface MentionChipProps {
	channelId: string;
	person: ChannelPerson;
	isSelf: boolean;
	children: ReactNode;
}

export function MentionChip({
	channelId,
	person,
	isSelf,
	children,
}: MentionChipProps) {
	return (
		<PersonHoverCard channelId={channelId} person={person} isSelf={isSelf}>
			<span
				className={cn(
					"rounded px-0.5 font-medium hover:underline",
					isSelf
						? "bg-primary/15 text-foreground"
						: "bg-accent text-foreground",
				)}
			>
				{children}
			</span>
		</PersonHoverCard>
	);
}

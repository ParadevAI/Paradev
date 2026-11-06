import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import type { ChannelPerson } from "../MessageBody";
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
					"rounded-[4px] px-[3px] font-medium",
					isSelf
						? "bg-primary/15 text-foreground"
						: "bg-link/14 text-link hover:bg-link/24",
				)}
			>
				{children}
			</span>
		</PersonHoverCard>
	);
}

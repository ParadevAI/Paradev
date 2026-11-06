import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import type { ReactNode } from "react";
import { useOpenProfile } from "../../hooks/useOpenProfile";
import { PersonCard } from "../PersonCard";

interface PersonHoverCardProps {
	channelId: string;
	person: { id: string; name: string; image: string | null };
	isSelf: boolean;
	children: ReactNode;
}

/** Hovering a name, avatar or mention shows the person's card; clicking opens their profile. */
export function PersonHoverCard({
	channelId,
	person,
	isSelf,
	children,
}: PersonHoverCardProps) {
	const openProfile = useOpenProfile(channelId);
	return (
		<HoverCard openDelay={400} closeDelay={100}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					onClick={() => openProfile(person)}
					className="cursor-pointer text-left"
				>
					{children}
				</button>
			</HoverCardTrigger>
			<HoverCardContent align="start" className="w-auto p-0">
				<PersonCard
					userId={person.id}
					name={person.name}
					image={person.image}
					isSelf={isSelf}
					onViewProfile={() => openProfile(person)}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}

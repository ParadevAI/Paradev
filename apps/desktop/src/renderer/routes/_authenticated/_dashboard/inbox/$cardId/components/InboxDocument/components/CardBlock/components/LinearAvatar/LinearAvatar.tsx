import { cn } from "@superset/ui/utils";
import type { LinearPersonView } from "../../types";
import { LetterAvatar } from "../LetterAvatar";

interface LinearAvatarProps {
	person: Pick<LinearPersonView, "id" | "name" | "avatar">;
	className?: string;
}

/** A Linear person's photo, or their initial. */
export function LinearAvatar({ person, className }: LinearAvatarProps) {
	return (
		<LetterAvatar
			address={{ name: person.name, email: person.id || person.name }}
			photo={person.avatar}
			className={cn("size-5 text-[10px]", className)}
		/>
	);
}

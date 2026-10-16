import { cn } from "@superset/ui/utils";
import { LetterAvatar } from "../LetterAvatar";

interface GithubAvatarProps {
	/** A login, or a team's name. */
	name: string;
	avatarUrl: string | null;
	className?: string;
}

/** A GitHub account's picture, or its initial. */
export function GithubAvatar({
	name,
	avatarUrl,
	className,
}: GithubAvatarProps) {
	return (
		<LetterAvatar
			address={{ name, email: name }}
			photo={avatarUrl}
			className={cn("size-4 text-[9px]", className)}
		/>
	);
}

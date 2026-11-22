import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	type PullRequestActivityAuthor,
	pullRequestAuthorLabel,
} from "../../utils/pullRequestAuthorLabel";

interface PullRequestActivityAvatarProps {
	author: PullRequestActivityAuthor | null;
}

/** The 20px avatar that marks a person on the rail or leads a folded row. */
export function PullRequestActivityAvatar({
	author,
}: PullRequestActivityAvatarProps) {
	const label = pullRequestAuthorLabel(author);
	const src =
		author?.avatarUrl ??
		(author?.login
			? `https://github.com/${author.login}.png?size=64`
			: undefined);
	return (
		<Avatar className="size-5 shrink-0 rounded-full ring-1 ring-border/50">
			<AvatarImage src={src} alt="" />
			<AvatarFallback className="text-[9px]">
				{label.slice(0, 1).toUpperCase()}
			</AvatarFallback>
		</Avatar>
	);
}

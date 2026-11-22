import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { cn } from "@superset/ui/utils";

interface GitHubAuthorAvatarProps {
	login: string;
	className?: string;
}

export function GitHubAuthorAvatar({
	login,
	className,
}: GitHubAuthorAvatarProps) {
	return (
		<Avatar
			className={cn(
				"size-4 shrink-0 rounded-full ring-1 ring-border/50",
				className,
			)}
		>
			<AvatarImage
				src={`https://github.com/${login}.png?size=64`}
				alt={login}
			/>
			<AvatarFallback className="text-[8px]">
				{login.slice(0, 1).toUpperCase()}
			</AvatarFallback>
		</Avatar>
	);
}

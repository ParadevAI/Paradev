import { Avatar, type AvatarProps } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";

interface PersonAvatarProps {
	name: string;
	image: string | null;
	size?: AvatarProps["size"];
	className?: string;
}

/** A person's picture in Slack's shape: a square with rounded corners at every size. */
export function PersonAvatar({
	name,
	image,
	size = "md",
	className,
}: PersonAvatarProps) {
	return (
		<Avatar
			size={size}
			fullName={name}
			image={image}
			className={cn("rounded-[22%] *:rounded-[22%]", className)}
		/>
	);
}

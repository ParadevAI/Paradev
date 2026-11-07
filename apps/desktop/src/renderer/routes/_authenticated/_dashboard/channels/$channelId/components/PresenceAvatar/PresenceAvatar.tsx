import { cn } from "@superset/ui/utils";
import { useUserPresence } from "renderer/stores/org-presence";
import { PersonAvatar } from "../PersonAvatar";

interface PresenceAvatarProps {
	userId: string;
	name: string;
	image: string | null;
	size: "sm" | "md";
	ringClassName?: string;
}

/** An avatar with a green dot while the person is active. */
export function PresenceAvatar({
	userId,
	name,
	image,
	size,
	ringClassName = "ring-popover",
}: PresenceAvatarProps) {
	const presence = useUserPresence(userId);
	return (
		<span className="relative shrink-0">
			<PersonAvatar size={size} name={name} image={image} />
			{presence === "active" && (
				<span
					className={cn(
						"absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2",
						ringClassName,
					)}
				/>
			)}
		</span>
	);
}

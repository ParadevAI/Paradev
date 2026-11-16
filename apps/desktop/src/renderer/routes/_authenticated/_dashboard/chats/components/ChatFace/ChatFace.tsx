import type { Chat } from "@superset/chats-core";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";

/** A chat's face: its Dev's in a 1:1, the group's own otherwise. */
export function ChatFace({
	chat,
	size,
	className,
}: {
	chat: Chat;
	size: number;
	className?: string;
}) {
	const seed = chat.kind === "direct" ? (chat.devIds[0] ?? chat.id) : chat.id;
	return <FaceAvatar seed={seed} size={size} className={className} />;
}

import type { Chat } from "@superset/chats-core";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { DevFace } from "../DevFace";

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
	const devId = chat.kind === "direct" ? chat.devIds[0] : undefined;
	return devId ? (
		<DevFace devId={devId} size={size} className={className} />
	) : (
		<FaceAvatar seed={chat.id} size={size} className={className} />
	);
}

import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { type ComponentProps, useMemo } from "react";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { useOrgDevs } from "../../hooks/useOrgDevs";
import { messageTime } from "../../utils/messageTime";
import { type ChannelPerson, MessageBody } from "../MessageBody";
import { PersonAvatar } from "../PersonAvatar";

export type DevFace = {
	name: string;
	avatar: ComponentProps<typeof DevAvatar>["avatar"];
};

/** The org's Devs by id, for drawing who wrote a message. */
export function useDevFaces(): Map<string, DevFace> {
	const devs = useOrgDevs();
	return useMemo(
		() =>
			new Map(
				(devs ?? []).map((dev) => [
					dev.id,
					{ name: dev.name, avatar: dev.avatar },
				]),
			),
		[devs],
	);
}

interface ThreadMessageProps {
	message: ChannelMessage;
	peopleById: Map<string, ChannelPerson>;
	devsById: Map<string, DevFace>;
	currentUserId: string | null;
	/** The row above is from the same author, so this one shows only its text. */
	continued?: boolean;
}

/** One message in a thread: who, when, and the words. */
export function ThreadMessage({
	message,
	peopleById,
	devsById,
	currentUserId,
	continued = false,
}: ThreadMessageProps) {
	const { t } = useLingui();
	const dev = message.authorId ? devsById.get(message.authorId) : null;
	const person = message.authorId ? peopleById.get(message.authorId) : null;
	const name = dev?.name ?? person?.name ?? t({ message: "Unknown" });
	return (
		<div className={cn("flex gap-3 px-4", continued ? "py-0.5" : "py-2")}>
			<span className="w-7 shrink-0">
				{!continued &&
					(dev ? (
						<DevAvatar avatar={dev.avatar} size={28} />
					) : (
						<PersonAvatar
							name={name}
							image={person?.image ?? null}
							className="size-7 text-[11px]"
						/>
					))}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{!continued && (
					<span className="flex items-baseline gap-2">
						<span className="text-[13px] font-semibold">{name}</span>
						<span className="text-[11px] text-muted-foreground tabular-nums">
							{messageTime(message.createdAt)}
						</span>
					</span>
				)}
				<MessageBody
					message={message}
					peopleById={peopleById}
					currentUserId={currentUserId}
					className="text-[14px] leading-[1.5]"
				/>
			</div>
		</div>
	);
}

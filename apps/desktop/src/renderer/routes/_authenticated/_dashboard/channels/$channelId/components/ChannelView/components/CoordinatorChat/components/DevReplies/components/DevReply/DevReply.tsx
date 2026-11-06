import { useLingui } from "@lingui/react/macro";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { messageTime } from "../../../../../../../../utils/messageTime";
import {
	type ChannelPerson,
	MessageBody,
} from "../../../../../../../MessageBody";
import { PersonAvatar } from "../../../../../../../PersonAvatar";
import type { DevFace } from "../../../../../../../ThreadMessage";

interface DevReplyProps {
	message: ChannelMessage;
	peopleById: Map<string, ChannelPerson>;
	devsById: Map<string, DevFace>;
	currentUserId: string | null;
}

/** One reply in the thread under a message: who, when, and the words. */
export function DevReply({
	message,
	peopleById,
	devsById,
	currentUserId,
}: DevReplyProps) {
	const { t } = useLingui();
	const dev = message.authorId ? devsById.get(message.authorId) : null;
	const person = message.authorId ? peopleById.get(message.authorId) : null;
	const name = dev?.name ?? person?.name ?? t({ message: "Unknown" });
	return (
		<div className="flex gap-2.5">
			<span className="mt-px shrink-0">
				{dev ? (
					<DevAvatar avatar={dev.avatar} size={20} />
				) : (
					<PersonAvatar
						name={name}
						image={person?.image ?? null}
						className="size-5 text-[9px]"
					/>
				)}
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="flex items-baseline gap-1.5 leading-5">
					<span className="truncate text-[13px] font-semibold text-foreground">
						{name}
					</span>
					{dev && (
						<span className="shrink-0 rounded-[4px] bg-muted px-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
							{t({ message: "Dev" })}
						</span>
					)}
					<span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
						{messageTime(message.createdAt)}
					</span>
				</span>
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

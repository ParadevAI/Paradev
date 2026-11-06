import { Trans } from "@lingui/react/macro";
import {
	ChatMarkdown,
	type ChatMarkdownProps,
	chatMarkdownComponents,
} from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useMemo } from "react";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { useOrgChannels } from "../../hooks/useOrgChannels";
import { useOrgDevs } from "../../hooks/useOrgDevs";
import { EDITED_HREF, remarkEditedMark } from "../../utils/remarkEditedMark";
import {
	CHANNEL_HREF_PREFIX,
	MENTION_HREF_PREFIX,
	remarkChannelRefs,
	remarkMentions,
} from "../../utils/remarkMentions";
import { BroadcastChip } from "../BroadcastChip";
import { ChannelRefChip } from "../ChannelRefChip";
import { DevMentionChip } from "../DevMentionChip";
import { MentionChip } from "../MentionChip";
import { MessageAttachments } from "../MessageAttachments";

export interface ChannelPerson {
	id: string;
	name: string;
	image: string | null;
}

const BROADCAST_ID_PREFIX = "broadcast:";
const DEV_ID_PREFIX = "dev:";

interface MessageBodyProps {
	message: ChannelMessage;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
	className?: string;
}

/**
 * A message's text as it was written: markdown with its mentions, channel
 * references and edited mark as chips, and its attachments under it.
 */
export function MessageBody({
	message,
	peopleById,
	currentUserId,
	className,
}: MessageBodyProps) {
	const navigate = useNavigate();
	const channels = useOrgChannels();
	const devs = useOrgDevs();
	const markdown = useMemo(() => {
		const mentioned = [
			...message.mentionedIds.flatMap((id) => {
				const person = peopleById.get(id);
				if (person) return [person];
				const dev = devs?.find((candidate) => candidate.id === id);
				return dev ? [{ id: `${DEV_ID_PREFIX}${id}`, name: dev.name }] : [];
			}),
			...(message.broadcast
				? [
						{
							id: `${BROADCAST_ID_PREFIX}${message.broadcast}`,
							name: message.broadcast,
						},
					]
				: []),
		];
		const DefaultLink = chatMarkdownComponents.a;
		const components: ChatMarkdownProps["components"] = {
			a: (props: ComponentProps<typeof DefaultLink>) => {
				if (props.href === EDITED_HREF) {
					return (
						<span className="text-[11px] text-muted-foreground">
							<Trans>(edited)</Trans>
						</span>
					);
				}
				if (props.href?.startsWith(CHANNEL_HREF_PREFIX)) {
					const channelId = props.href.slice(CHANNEL_HREF_PREFIX.length);
					return (
						<ChannelRefChip
							onClick={() =>
								void navigate({
									to: "/channels/$channelId",
									params: { channelId },
								})
							}
						>
							{props.children}
						</ChannelRefChip>
					);
				}
				const id = props.href?.startsWith(MENTION_HREF_PREFIX)
					? props.href.slice(MENTION_HREF_PREFIX.length)
					: null;
				if (id?.startsWith(DEV_ID_PREFIX)) {
					return (
						<DevMentionChip agentId={id.slice(DEV_ID_PREFIX.length)}>
							{props.children}
						</DevMentionChip>
					);
				}
				if (id?.startsWith(BROADCAST_ID_PREFIX)) {
					return <BroadcastChip>{props.children}</BroadcastChip>;
				}
				const person = id ? peopleById.get(id) : undefined;
				if (!person) return <DefaultLink {...props} />;
				return (
					<MentionChip
						channelId={message.channelId}
						person={person}
						isSelf={person.id === currentUserId}
					>
						{props.children}
					</MentionChip>
				);
			},
		};
		const remarkPlugins: NonNullable<ChatMarkdownProps["remarkPlugins"]> = [];
		if (mentioned.length > 0) {
			remarkPlugins.push([remarkMentions, { people: mentioned }]);
		}
		if (channels?.length && message.body.includes("#")) {
			remarkPlugins.push([
				remarkChannelRefs,
				{ channels: channels.map(({ id, name }) => ({ id, name })) },
			]);
		}
		if (message.editedAt) remarkPlugins.push(remarkEditedMark);
		return {
			components,
			remarkPlugins: remarkPlugins.length > 0 ? remarkPlugins : undefined,
		};
	}, [
		message.body,
		channels,
		navigate,
		message.mentionedIds,
		devs,
		message.broadcast,
		message.channelId,
		message.editedAt,
		peopleById,
		currentUserId,
	]);

	return (
		<div
			className={cn(
				"cursor-text select-text text-[15px] leading-[1.4667] [&_p]:my-0.5",
				className,
			)}
		>
			{message.body && (
				<ChatMarkdown
					components={markdown.components}
					remarkPlugins={markdown.remarkPlugins}
				>
					{message.body}
				</ChatMarkdown>
			)}
			<MessageAttachments attachments={message.attachments} />
		</div>
	);
}

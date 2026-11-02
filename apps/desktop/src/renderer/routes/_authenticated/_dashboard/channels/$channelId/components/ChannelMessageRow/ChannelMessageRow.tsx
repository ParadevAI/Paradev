import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
	ChatMarkdown,
	type ChatMarkdownProps,
	chatMarkdownComponents,
} from "@superset/chat-ui/ChatMarkdown";
import { errorMessage } from "@superset/i18n/errors";
import {
	formatClockTime,
	formatDateTime,
	formatRelativeTime,
} from "@superset/i18n/format";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { type ComponentProps, useMemo, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useApplyChannelMessage } from "renderer/routes/_authenticated/hooks/useApplyChannelMessage";
import {
	type ChannelMessage,
	PENDING_SEQ,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
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
import { DevBadge } from "../DevBadge";
import { DevMentionChip } from "../DevMentionChip";
import { MentionChip } from "../MentionChip";
import { PersonAvatar } from "../PersonAvatar";
import { PersonHoverCard } from "../PersonHoverCard";
import { MembershipText } from "./components/MembershipText";
import { MessageActions } from "./components/MessageActions";
import { MessageAttachments } from "./components/MessageAttachments";
import { type MessageEdit, MessageEditor } from "./components/MessageEditor";
import { MessageMenu } from "./components/MessageMenu";
import { MessageReactions } from "./components/MessageReactions";
import { useMessageDev } from "./hooks/useMessageDev";
import { useMessageMenuItems } from "./hooks/useMessageMenuItems";
import { toggleReaction } from "./utils/toggleReaction";

const BROADCAST_ID_PREFIX = "broadcast:";
const DEV_ID_PREFIX = "dev:";
export interface ChannelPerson {
	id: string;
	name: string;
	image: string | null;
}

interface ChannelMessageRowProps {
	message: ChannelMessage;
	author: ChannelPerson | null;
	compact: boolean;
	/** For a join or leave: the run it leads, drawn as one sentence group. */
	rollup?: ChannelMessage[] | null;
	now: Date;
	currentUserId: string | null;
	canModerate: boolean;
	canReact: boolean;
	peopleById: Map<string, ChannelPerson>;
	onOpenThread?: (message: ChannelMessage) => void;
	/** Also on Option+click, as in Slack. */
	onMarkUnread?: () => void;
	follow?: { following: boolean; onToggle: () => void };
}

export function ChannelMessageRow({
	message,
	author,
	compact,
	rollup,
	now,
	currentUserId,
	canModerate,
	canReact,
	peopleById,
	onOpenThread,
	onMarkUnread,
	follow,
}: ChannelMessageRowProps) {
	const { t } = useLingui();
	const { apply } = useApplyChannelMessage();
	const [editing, setEditing] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const isPending = message.seq === PENDING_SEQ;
	const isDeleted = message.deletedAt !== null;
	const isOwn = message.authorId === currentUserId;
	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const edit = cloudTrpc.channelMessage.edit.useMutation({
		onSuccess: apply,
		onError: (error) => {
			apply(message);
			onError(error);
		},
	});
	const remove = cloudTrpc.channelMessage.delete.useMutation({
		onSuccess: apply,
		onError,
	});
	const utils = cloudTrpc.useUtils();
	const reactMutation = cloudTrpc.channelMessage.react.useMutation({
		onSuccess: apply,
		onError: (error) => {
			void utils.channelMessage.list.invalidate({
				channelId: message.channelId,
			});
			const rootId = message.threadRootId ?? message.id;
			void utils.channelMessage.thread.invalidate({ messageId: rootId });
			onError(error);
		},
	});
	const react =
		canReact && currentUserId && !isPending && !isDeleted
			? (emoji: string, reacted: boolean) => {
					apply({
						...message,
						reactions: toggleReaction(
							message.reactions,
							emoji,
							currentUserId,
							reacted,
						),
					});
					reactMutation.mutate({ messageId: message.id, emoji, reacted });
				}
			: undefined;
	const reactWith =
		react &&
		((emoji: string) =>
			react(
				emoji,
				!message.reactions.some(
					(reaction) =>
						reaction.emoji === emoji &&
						reaction.actorIds.includes(currentUserId ?? ""),
				),
			));
	const menu = useMessageMenuItems({
		message,
		onMarkUnread,
		follow,
		onEdit: isOwn && !message.subtype ? () => setEditing(true) : undefined,
		onDelete:
			isOwn || canModerate
				? () => remove.mutate({ messageId: message.id })
				: undefined,
	});

	const saveEdit = (next: MessageEdit) => {
		setEditing(false);
		if (next.body === message.body) return;
		apply({ ...message, ...next, editedAt: new Date() });
		edit.mutate({ messageId: message.id, ...next });
	};

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
				{ channels: channelRefs(channels) },
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

	const dev = useMessageDev(message.authorId);
	const channel = channels?.find((entry) => entry.id === message.channelId);
	const devNames = useMemo(
		() => new Map((devs ?? []).map((entry) => [entry.id, entry.name])),
		[devs],
	);
	const authorName = dev?.name ?? author?.name ?? t({ message: "Unknown" });
	const time = formatDateTime(message.createdAt, { timeStyle: "short" });

	const interactive = !isPending && !isDeleted && !editing;
	const row = (
		// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: Option+click is a pointer shortcut; the menu offers the same action
		<div
			data-message-id={message.id}
			onClick={(event) => {
				if (!event.altKey || !onMarkUnread || !interactive) return;
				event.preventDefault();
				onMarkUnread();
			}}
			className={cn(
				"group group/msg relative flex gap-2.5 px-4 hover:bg-fill-hover/40",
				compact ? "py-0.5" : "pt-2 pb-0.5",
				isPending && "opacity-60",
				menuOpen && "bg-fill-hover/40",
			)}
		>
			<div className="w-9 shrink-0">
				{compact ? (
					<Tooltip delayDuration={500}>
						<TooltipTrigger asChild>
							<span className="invisible block pt-[3px] text-right text-[11px] whitespace-nowrap text-muted-foreground tabular-nums group-hover:visible">
								{formatClockTime(message.createdAt)}
							</span>
						</TooltipTrigger>
						<TooltipContent>{formatDateTime(message.createdAt)}</TooltipContent>
					</Tooltip>
				) : dev ? (
					<DevAvatar avatar={dev.avatar} size={36} className="mt-0.5" />
				) : author ? (
					<PersonHoverCard
						channelId={message.channelId}
						person={author}
						isSelf={author.id === currentUserId}
					>
						<PersonAvatar
							name={authorName}
							image={author.image}
							className="mt-0.5 size-9"
						/>
					</PersonHoverCard>
				) : (
					<PersonAvatar
						name={authorName}
						image={null}
						className="mt-0.5 size-9"
					/>
				)}
			</div>
			<div className="min-w-0 flex-1">
				{!compact && (
					<div className="flex items-baseline gap-2">
						{dev ? (
							<span className="flex items-baseline gap-1.5">
								<span className="text-[15px] font-bold">{authorName}</span>
								<DevBadge />
							</span>
						) : author ? (
							<PersonHoverCard
								channelId={message.channelId}
								person={author}
								isSelf={author.id === currentUserId}
							>
								<span className="text-[15px] font-bold hover:underline">
									{authorName}
								</span>
							</PersonHoverCard>
						) : (
							<span className="text-[15px] font-bold">{authorName}</span>
						)}
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
									{time}
								</span>
							</TooltipTrigger>
							<TooltipContent>
								{formatDateTime(message.createdAt)}
							</TooltipContent>
						</Tooltip>
					</div>
				)}
				{isDeleted ? (
					<p className="text-sm text-muted-foreground italic">
						<Trans>This message was deleted</Trans>
					</p>
				) : editing ? (
					<MessageEditor
						channelId={message.channelId}
						body={message.body}
						mentionedIds={message.mentionedIds}
						people={[...peopleById.values()]}
						currentUserId={currentUserId}
						onSave={saveEdit}
						onCancel={() => setEditing(false)}
					/>
				) : message.subtype ? (
					<MembershipText
						messages={rollup ?? [message]}
						channelId={message.channelId}
						channelLabel={
							channel?.visibility === "private"
								? channel.name
								: `#${channel?.name ?? ""}`
						}
						isDev={dev !== null}
						peopleById={peopleById}
						devNames={devNames}
						currentUserId={currentUserId}
					/>
				) : (
					<div className="cursor-text select-text text-[15px] leading-[1.4667] [&_p]:my-0.5">
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
				)}
				{!isDeleted && (
					<MessageReactions
						reactions={message.reactions}
						currentUserId={currentUserId}
						peopleById={peopleById}
						onReact={react}
					/>
				)}
				{onOpenThread && message.replyCount > 0 && (
					<button
						type="button"
						onClick={() => onOpenThread(message)}
						className="mt-1 mb-1 flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 text-xs hover:bg-fill-hover"
					>
						<span className="font-medium text-primary">
							<Plural
								value={message.replyCount}
								one="# reply"
								other="# replies"
							/>
						</span>
						{message.lastReplyAt && (
							<span className="text-muted-foreground">
								<Trans>
									Last reply{" "}
									{formatRelativeTime(
										Math.min(message.lastReplyAt.getTime(), now.getTime()),
										now,
									)}
								</Trans>
							</span>
						)}
					</button>
				)}
			</div>
			{interactive && (
				<MessageActions
					menu={menu}
					onReact={reactWith}
					onReply={onOpenThread && (() => onOpenThread(message))}
					open={menuOpen}
					onOpenChange={setMenuOpen}
				/>
			)}
		</div>
	);
	return interactive ? (
		<MessageMenu menu={menu} onOpenChange={setMenuOpen}>
			{row}
		</MessageMenu>
	) : (
		row
	);
}

function channelRefs(channels: readonly { id: string; name: string }[]) {
	return channels.map(({ id, name }) => ({ id, name }));
}

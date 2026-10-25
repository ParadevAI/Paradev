import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChannelComposer } from "../../../ChannelComposer";
import {
	ChannelMessageRow,
	type ChannelPerson,
} from "../../../ChannelMessageRow";

interface ThreadPaneProps {
	channelId: string;
	messageId: string;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canModerate: boolean;
	canPost: boolean;
	now: Date;
}

export function ThreadPane({
	channelId,
	messageId,
	peopleById,
	people,
	currentUserId,
	canModerate,
	canPost,
	now,
}: ThreadPaneProps) {
	const { t } = useLingui();
	const { data, isPending, isError } = cloudTrpc.channelMessage.thread.useQuery(
		{ messageId },
		{ retry: false },
	);
	if (isPending) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted-foreground">
				<LuLoader className="size-4 animate-spin" />
			</div>
		);
	}
	if (isError || !data) {
		return (
			<p className="p-4 text-sm text-muted-foreground">
				<Trans>Message not found</Trans>
			</p>
		);
	}
	const authorOf = (id: string | null) =>
		id ? (peopleById.get(id) ?? null) : null;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto pb-2">
				<ChannelMessageRow
					message={data.root}
					author={authorOf(data.root.authorUserId)}
					compact={false}
					now={now}
					currentUserId={currentUserId}
					canModerate={canModerate}
				/>
				{data.replies.length > 0 && (
					<div className="my-2 flex items-center gap-2 px-4 text-[11px] text-muted-foreground">
						<span>
							<Plural
								value={data.replies.length}
								one="# reply"
								other="# replies"
							/>
						</span>
						<div className="h-px flex-1 bg-border" />
					</div>
				)}
				{data.replies.map((reply, index) => {
					const previous = data.replies[index - 1];
					return (
						<ChannelMessageRow
							key={reply.id}
							message={reply}
							author={authorOf(reply.authorUserId)}
							compact={previous?.authorUserId === reply.authorUserId}
							now={now}
							currentUserId={currentUserId}
							canModerate={canModerate}
						/>
					);
				})}
			</div>
			{canPost && currentUserId && (
				<div className="shrink-0 p-3">
					<ChannelComposer
						key={messageId}
						channelId={channelId}
						threadRootId={messageId}
						people={people}
						currentUserId={currentUserId}
						placeholder={t({ message: "Reply…" })}
						autoFocus
					/>
				</div>
			)}
		</div>
	);
}

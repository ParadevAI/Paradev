import { Plural, Trans } from "@lingui/react/macro";
import { LuMessageSquareText } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelPerson } from "../../../ChannelMessageRow";
import { PersonAvatar } from "../../../PersonAvatar";
import { TabPreviewContent } from "../TabPreviewContent";

const PREVIEW_STALE_MS = 30_000;

interface ThreadTabPreviewProps {
	messageId: string;
	label: string;
	peopleById: Map<string, ChannelPerson>;
}

export function ThreadTabPreview({
	messageId,
	label,
	peopleById,
}: ThreadTabPreviewProps) {
	const { data } = cloudTrpc.channelMessage.thread.useQuery(
		{ messageId },
		{ staleTime: PREVIEW_STALE_MS, retry: false },
	);
	const root = data?.root;
	const author = root?.authorId ? peopleById.get(root.authorId) : null;
	return (
		<TabPreviewContent
			title={label}
			icon={<LuMessageSquareText />}
			subtitle={
				data ? (
					<Plural value={data.replies.length} one="# reply" other="# replies" />
				) : undefined
			}
			body={
				root ? (
					<div className="relative flex h-40 flex-col gap-2 overflow-hidden rounded-lg bg-muted/60 p-3">
						<div className="flex items-center gap-2">
							<PersonAvatar
								size="xs"
								name={author?.name ?? ""}
								image={author?.image ?? null}
							/>
							<span className="truncate text-xs font-medium">
								{author?.name}
							</span>
						</div>
						<p className="line-clamp-5 text-xs leading-5 whitespace-pre-wrap text-foreground/90">
							{root.deletedAt ? (
								<Trans>This message was deleted</Trans>
							) : (
								root.body
							)}
						</p>
						<div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-popover/80 to-transparent" />
					</div>
				) : undefined
			}
		/>
	);
}

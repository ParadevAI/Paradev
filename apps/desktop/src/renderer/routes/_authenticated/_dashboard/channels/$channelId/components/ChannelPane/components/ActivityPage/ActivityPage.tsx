import { Trans, useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo } from "react";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useOrgDevs } from "../../../../hooks/useOrgDevs";
import {
	EMPTY_ACTIVITY,
	useChannelActivityStore,
} from "../../../../stores/channelActivityStore";
import type { ChannelPanePage } from "../../../../stores/channelPaneStore";
import {
	type ActivityEntry,
	eventLine,
	eventState,
	sortEntries,
} from "../../../../utils/activityEntries";
import { ChannelComposer } from "../../../ChannelComposer";
import type { ChannelPerson } from "../../../MessageBody";
import { PersonAvatar } from "../../../PersonAvatar";
import { StateDot } from "../../../StateDot";
import { ActivityRow } from "./components/ActivityRow";
import { AgentSaid } from "./components/AgentSaid";

interface ActivityPageProps {
	channelId: string;
	channelName: string;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canPost: boolean;
	onOpen: (page: ChannelPanePage) => void;
}

const LINE_CHARS = 140;

/** A message's first line, short enough for a row. */
function firstLine(body: string): string {
	const line =
		body
			.split("\n")
			.map((part) => part.trim())
			.find(Boolean) ?? "";
	return line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS - 1)}…` : line;
}

/**
 * The channel's story in one list, newest first: what its agents did, what
 * people and Devs posted, who joined. Every line leads somewhere, and a note
 * from the bottom goes on the log.
 */
export function ActivityPage({
	channelId,
	channelName,
	peopleById,
	people,
	currentUserId,
	canPost,
	onOpen,
}: ActivityPageProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const devs = useOrgDevs();
	const devsById = useMemo(
		() => new Map((devs ?? []).map((dev) => [dev.id, dev])),
		[devs],
	);
	const activity = useChannelActivityStore(
		(state) => state.byChannelId[channelId] ?? EMPTY_ACTIVITY,
	);
	const markSeen = useChannelActivityStore((state) => state.markSeen);
	useEffect(() => {
		markSeen(channelId);
	}, [channelId, markSeen]);
	const query = cloudTrpc.channelMessage.list.useInfiniteQuery(
		{ channelId },
		{ getNextPageParam: (page) => page.nextCursor ?? undefined },
	);
	const entries = useMemo(() => {
		const nameOf = (actorId: string | null) =>
			(actorId &&
				(devsById.get(actorId)?.name ?? peopleById.get(actorId)?.name)) ||
			t({ message: "Someone" });
		const posts: ActivityEntry[] = (query.data?.pages ?? [])
			.flatMap((page) => page.messages)
			.filter((message) => message.deletedAt === null)
			.map((message) =>
				message.subtype
					? {
							kind: "membership" as const,
							id: `message:${message.id}`,
							at: message.createdAt.getTime(),
							text:
								message.subtype === "channel_join"
									? t({ message: `${nameOf(message.authorId)} joined` })
									: t({ message: `${nameOf(message.authorId)} left` }),
						}
					: {
							kind: "note" as const,
							id: `message:${message.id}`,
							at: message.createdAt.getTime(),
							messageId: message.id,
							authorId: message.authorId,
							who: nameOf(message.authorId),
							text: firstLine(message.body),
							replies: message.replyCount,
						},
			);
		// Once an agent went on to something newer, its "joined" and "started
		// working" lines say nothing the newer line does not.
		const newestAt = new Map<string, number>();
		for (const event of activity.events) {
			const at = newestAt.get(event.workspaceId) ?? 0;
			if (event.at > at) newestAt.set(event.workspaceId, event.at);
		}
		// "Went idle" right after "finished" says nothing either.
		const restsAfterFinish = new Set(
			activity.events.flatMap((event, index) => {
				if (event.kind !== "idle") return [];
				const before = activity.events
					.slice(0, index)
					.findLast((other) => other.workspaceId === event.workspaceId);
				return before?.kind === "review" || before?.kind === "waiting"
					? [event.id]
					: [];
			}),
		);
		const events: ActivityEntry[] = activity.events
			.filter(
				(event) =>
					!restsAfterFinish.has(event.id) &&
					((event.kind !== "joined" && event.kind !== "working") ||
						event.at >= (newestAt.get(event.workspaceId) ?? 0)),
			)
			.map((event) => ({
				kind: "agent" as const,
				id: `event:${event.id}`,
				at: event.at,
				workspaceId: event.workspaceId,
				name: event.name,
				event: event.kind,
				...(event.prNumber === undefined ? {} : { prNumber: event.prNumber }),
			}));
		return sortEntries([...posts, ...events]);
	}, [query.data, activity.events, devsById, peopleById, t]);

	const newestByAgent = useMemo(() => {
		const newest = new Map<string, string>();
		for (const entry of entries) {
			if (entry.kind === "agent" && !newest.has(entry.workspaceId)) {
				newest.set(entry.workspaceId, entry.id);
			}
		}
		return newest;
	}, [entries]);

	const authorOf = (authorId: string | null) => {
		const dev = authorId ? devsById.get(authorId) : null;
		if (dev) return <DevAvatar avatar={dev.avatar} size={20} />;
		const person = authorId ? peopleById.get(authorId) : null;
		if (person) {
			return (
				<PersonAvatar
					name={person.name}
					image={person.image}
					className="size-5 text-[9px]"
				/>
			);
		}
		return <span className="size-1.5 rounded-full bg-muted-foreground/50" />;
	};

	const row = (entry: ActivityEntry) => {
		switch (entry.kind) {
			case "agent": {
				const open = () => onOpen({ kind: "agent", id: entry.workspaceId });
				return (
					<ActivityRow
						key={entry.id}
						leading={<StateDot state={eventState(entry.event)} />}
						label={t(eventLine(entry))}
						detail={
							newestByAgent.get(entry.workspaceId) === entry.id ? (
								<AgentSaid workspaceId={entry.workspaceId} />
							) : undefined
						}
						at={entry.at}
						onClick={open}
						actions={[
							{ label: t({ message: "Reply" }), onClick: open },
							{
								label: t({ message: "Open" }),
								onClick: () =>
									void navigateToV2Workspace(entry.workspaceId, navigate),
							},
						]}
					/>
				);
			}
			case "note": {
				const open = () => onOpen({ kind: "thread", id: entry.messageId });
				return (
					<ActivityRow
						key={entry.id}
						leading={authorOf(entry.authorId)}
						label={
							<>
								<span className="font-medium">{entry.who}</span>{" "}
								<span className="text-foreground/80">{entry.text}</span>
							</>
						}
						detail={
							entry.replies > 0
								? t({ message: `${entry.replies} replies` })
								: undefined
						}
						at={entry.at}
						onClick={open}
						actions={[{ label: t({ message: "Reply" }), onClick: open }]}
					/>
				);
			}
			case "membership":
				return (
					<ActivityRow
						key={entry.id}
						leading={
							<span className="size-1.5 rounded-full bg-muted-foreground/50" />
						}
						label={<span className="text-muted-foreground">{entry.text}</span>}
						at={entry.at}
					/>
				);
		}
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="flex flex-col gap-px p-3">
					{query.isPending && entries.length === 0 ? (
						<div className="flex justify-center py-10 text-muted-foreground">
							<LuLoader className="size-4 animate-spin" />
						</div>
					) : entries.length === 0 ? (
						<p className="px-2 py-1 text-[13px] leading-[18px] text-muted-foreground">
							<Trans>
								Nothing yet. Agents, Devs and people show up here as the channel
								moves.
							</Trans>
						</p>
					) : (
						entries.map((entry, index) => {
							const previous = entries[index - 1];
							const day = formatDate(new Date(entry.at));
							const spansDays =
								entries.length > 0 &&
								formatDate(new Date(entries[entries.length - 1]?.at ?? 0)) !==
									formatDate(new Date(entries[0]?.at ?? 0));
							const newDay =
								index === 0
									? spansDays
									: previous !== undefined &&
										formatDate(new Date(previous.at)) !== day;
							const today = day === formatDate(new Date());
							return (
								<Fragment key={entry.id}>
									{newDay && (
										<div className="flex items-center gap-2 px-2 pt-3 pb-1 text-[10px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
											{today ? <Trans>Today</Trans> : day}
											<span className="h-px flex-1 bg-border" />
										</div>
									)}
									{row(entry)}
								</Fragment>
							);
						})
					)}
					{query.hasNextPage && (
						<button
							type="button"
							disabled={query.isFetchingNextPage}
							onClick={() => void query.fetchNextPage()}
							className="mt-2 h-8 rounded-md text-[13px] text-muted-foreground hover:bg-fill-hover hover:text-foreground"
						>
							<Trans>Show older</Trans>
						</button>
					)}
				</div>
			</div>
			{canPost && currentUserId && (
				<div className="shrink-0 px-3 pb-3">
					<ChannelComposer
						channelId={channelId}
						threadRootId={null}
						people={people}
						currentUserId={currentUserId}
						placeholder={t({ message: `Add a note to #${channelName}` })}
						compact
					/>
				</div>
			)}
		</div>
	);
}

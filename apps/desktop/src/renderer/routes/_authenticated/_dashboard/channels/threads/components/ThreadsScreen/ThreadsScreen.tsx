import { Trans } from "@lingui/react/macro";
import { useEffect, useMemo } from "react";
import { LuLoader, LuMessageSquareText } from "react-icons/lu";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useNow } from "renderer/hooks/useNow";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useViewedChannelStore } from "renderer/routes/_authenticated/stores/viewedChannelStore";
import type { ChannelPerson } from "../../../$channelId/components/ChannelMessageRow";
import { ThreadCard } from "./components/ThreadCard";

const NOW_TICK_MS = 30_000;

/** Slack's Threads view: followed threads, unread first. Opening one marks it read. */
export function ThreadsScreen() {
	const organizationId = useActiveOrganizationId();
	const setThreadsView = useViewedChannelStore((state) => state.setThreadsView);
	useEffect(() => {
		setThreadsView(true);
		return () => setThreadsView(false);
	}, [setThreadsView]);
	const now = useNow(NOW_TICK_MS);
	const { people, currentUserId } = useOrganizationPeople();
	const peopleById = useMemo(
		() => new Map<string, ChannelPerson>(people.map((p) => [p.id, p])),
		[people],
	);
	const { data: threads, isPending } = cloudTrpc.channelThread.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: organizationId !== null },
	);

	return (
		<div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
			<PageHeader
				className="border-b border-border"
				start={
					<div className="flex items-center gap-1.5 px-1.5">
						<LuMessageSquareText className="size-4" />
						<span className="text-[15px] font-bold">
							<Trans>Threads</Trans>
						</span>
					</div>
				}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isPending && organizationId !== null ? (
					<div className="flex justify-center py-10 text-muted-foreground">
						<LuLoader className="size-4 animate-spin" />
					</div>
				) : !threads?.length ? (
					<p className="py-10 text-center text-sm text-muted-foreground">
						<Trans>No threads yet</Trans>
					</p>
				) : (
					<div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
						{threads.map((thread) => (
							<ThreadCard
								key={thread.rootId}
								thread={thread}
								peopleById={peopleById}
								currentUserId={currentUserId}
								now={now}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { useNavigate } from "@tanstack/react-router";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { TurnStatus } from "./components/TurnStatus";

type Turn = RouterOutputs["agent"]["activity"]["turns"][number];

interface DevActivityTabProps {
	devId: string;
	onOpenChat: () => void;
}

export function DevActivityTab({ devId, onOpenChat }: DevActivityTabProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const { people, currentUserId } = useOrganizationPeople();
	const query = cloudTrpc.agent.activity.useInfiniteQuery(
		{ agentId: devId },
		{ getNextPageParam: (page) => page.nextCursor },
	);
	const turns = query.data?.pages.flatMap((page) => page.turns) ?? [];
	const describe = (turn: Turn) => {
		const channel = turn.channelName;
		if (turn.channelKind === "dm") return t({ message: "Replied to your DM" });
		if (turn.actingUserId === currentUserId) {
			return turn.reason === "mention"
				? t({ message: `Answered you in #${channel}` })
				: t({ message: `Followed up with you in #${channel}` });
		}
		const who =
			people.find((person) => person.id === turn.actingUserId)?.name ??
			t({ message: "someone" });
		return turn.reason === "mention"
			? t({ message: `Answered ${who} in #${channel}` })
			: t({ message: `Followed up with ${who} in #${channel}` });
	};
	const open = (turn: Turn) => {
		if (turn.channelKind === "dm") {
			onOpenChat();
			return;
		}
		void navigate({
			to: "/channels/$channelId",
			params: { channelId: turn.channelId },
			search: turn.threadRootId ? { thread: turn.threadRootId } : {},
		});
	};

	if (query.isPending) {
		return (
			<div className="flex flex-1 justify-center py-10 text-muted-foreground">
				<LuLoader className="size-4 animate-spin" />
			</div>
		);
	}
	if (query.isError) {
		return (
			<div className="flex flex-col items-start gap-2 px-6 pt-6 text-sm text-muted-foreground">
				<Trans>Couldn't load its activity</Trans>
				<button
					type="button"
					onClick={() => void query.refetch()}
					className="rounded-md px-2 py-1 text-foreground hover:bg-fill-hover"
				>
					<Trans>Try again</Trans>
				</button>
			</div>
		);
	}
	if (turns.length === 0) {
		return (
			<p className="px-6 pt-6 text-sm text-muted-foreground">
				<Trans>Nothing yet</Trans>
			</p>
		);
	}
	return (
		<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
			<div className="flex flex-col">
				{turns.map((turn) => (
					<button
						key={turn.id}
						type="button"
						onClick={() => open(turn)}
						className="flex h-10 items-center gap-3 rounded-md px-2 text-left text-[13px] hover:bg-fill-hover"
					>
						<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
							<TurnStatus status={turn.status} />
						</span>
						<span className="min-w-0 flex-1 truncate">{describe(turn)}</span>
						{turn.settledAt && (
							<span className="shrink-0 text-muted-foreground tabular-nums">
								{durationOf(turn.startedAt, turn.settledAt)}
							</span>
						)}
						<span className="w-16 shrink-0 text-right text-muted-foreground">
							{formatCompactRelativeTime(new Date(turn.startedAt))}
						</span>
					</button>
				))}
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
	);
}

function durationOf(startedAt: Date | string, settledAt: Date | string) {
	const seconds = Math.max(
		0,
		Math.round(
			(new Date(settledAt).getTime() - new Date(startedAt).getTime()) / 1000,
		),
	);
	return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

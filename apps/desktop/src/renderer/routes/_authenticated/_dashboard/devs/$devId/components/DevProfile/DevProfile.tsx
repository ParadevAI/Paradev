import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { useNavigate } from "@tanstack/react-router";
import {
	LuActivity,
	LuClock,
	LuHash,
	LuMessageSquare,
	LuZap,
} from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { PaneRow } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelPane/components/PaneRow";
import { PaneSection } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelPane/components/PaneSection";
import {
	PaneTile,
	PaneTiles,
} from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelPane/components/PaneTiles";
import type { ChannelPanePage } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/stores/channelPaneStore";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { describeDevTurn } from "../../utils/describeDevTurn";
import { TurnStatus } from "../TurnStatus";
import { DevDescription } from "./components/DevDescription";
import { DevInstructions } from "./components/DevInstructions";

type Dev = RouterOutputs["agent"]["get"];

interface DevProfileProps {
	dev: Dev;
	onCustomize: () => void;
	onOpen: (page: ChannelPanePage) => void;
}

const RECENT_WINDOW_MS = 24 * 60 * 60_000;
const THREADS_SHOWN = 3;

/** The Dev at a glance: who it is, what it has, where it talks, what it did lately, and how it should work. */
export function DevProfile({ dev, onCustomize, onOpen }: DevProfileProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const isPaused = dev.pausedAt !== null;
	const { data: routines } = cloudTrpc.agentRoutine.list.useQuery({
		agentId: dev.id,
	});
	const { data: activity } = cloudTrpc.agent.activity.useInfiniteQuery(
		{ agentId: dev.id },
		{ getNextPageParam: (page) => page.nextCursor },
	);
	const turns = activity?.pages[0]?.turns ?? [];
	const newestTurn = turns[0];
	const { people, currentUserId } = useOrganizationPeople();
	const who = {
		currentUserId,
		nameOf: (id: string | null) =>
			people.find((person) => person.id === id)?.name ??
			t({ message: "someone" }),
	};
	// Where it is active now: the newest turn of each thread, DMs aside.
	const threads = turns
		.filter((turn) => turn.channelKind !== "dm")
		.filter(
			(turn, index, all) =>
				all.findIndex(
					(other) =>
						other.channelId === turn.channelId &&
						(other.threadRootId ?? null) === (turn.threadRootId ?? null),
				) === index,
		)
		.slice(0, THREADS_SHOWN);
	const handled = turns.filter(
		(turn) =>
			Date.now() - new Date(turn.startedAt).getTime() < RECENT_WINDOW_MS,
	).length;
	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-5 p-3">
				<div className="flex flex-col items-center gap-2 px-2 pt-3 text-center">
					<DevAvatar
						avatar={dev.avatar}
						size={64}
						alive
						mood={isPaused ? "asleep" : dev.working ? "working" : "idle"}
					/>
					<h2 className="max-w-full truncate text-[16px] font-semibold">
						{dev.name}
					</h2>
					{dev.canManage && (
						<button
							type="button"
							onClick={onCustomize}
							className="mt-1 h-7 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium transition-colors hover:bg-fill-hover"
						>
							<Trans>Customize</Trans>
						</button>
					)}
				</div>
				<div className="px-2">
					<DevDescription dev={dev} />
				</div>

				<PaneTiles>
					<PaneTile
						icon={<LuClock />}
						label={<Trans>Automations</Trans>}
						count={routines?.length ?? 0}
						onClick={() => onOpen({ kind: "routines" })}
					/>
					<PaneTile
						icon={<LuActivity />}
						label={<Trans>Activity</Trans>}
						onClick={() => onOpen({ kind: "activity" })}
					/>
				</PaneTiles>

				{threads.length > 0 && (
					<PaneSection title={<Trans>Threads</Trans>} meta={threads.length}>
						{threads.map((turn) => (
							<PaneRow
								key={turn.id}
								leading={<TurnStatus status={turn.status} />}
								label={t(describeDevTurn(turn, who))}
								detail={`#${turn.channelName}`}
								trailing={formatCompactRelativeTime(new Date(turn.startedAt))}
								onClick={() =>
									void navigate({
										to: "/channels/$channelId",
										params: { channelId: turn.channelId },
										search: turn.threadRootId
											? { thread: turn.threadRootId }
											: {},
									})
								}
							/>
						))}
					</PaneSection>
				)}

				<PaneSection title={<Trans>Talks in</Trans>}>
					<PaneRow
						leading={<LuMessageSquare />}
						label={<Trans>Direct messages</Trans>}
						detail={<Trans>This conversation</Trans>}
					/>
					{dev.channels.map((channel) => (
						<PaneRow
							key={channel.id}
							leading={<LuHash />}
							label={channel.name}
							detail={<Trans>Reads and posts</Trans>}
							onClick={() =>
								void navigate({
									to: "/channels/$channelId",
									params: { channelId: channel.id },
								})
							}
						/>
					))}
				</PaneSection>

				{newestTurn && (
					<PaneSection title={<Trans>Recent</Trans>}>
						<PaneRow
							leading={<LuZap />}
							label={
								handled > 0
									? t({ message: `${handled} events handled today` })
									: t({ message: "Quiet today" })
							}
							detail={
								newestTurn.channelKind === "dm"
									? t({ message: "Last: replied to your DM" })
									: t({ message: `Last: in #${newestTurn.channelName}` })
							}
							trailing={formatCompactRelativeTime(
								new Date(newestTurn.startedAt),
							)}
							onClick={() => onOpen({ kind: "activity" })}
						/>
					</PaneSection>
				)}

				{dev.canManage && (
					<PaneSection title={<Trans>Instructions</Trans>}>
						<div className="px-2">
							<DevInstructions dev={dev} />
						</div>
					</PaneSection>
				)}
			</div>
		</div>
	);
}

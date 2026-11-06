import { Trans, useLingui } from "@lingui/react/macro";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { RouterOutputs } from "@superset/trpc";
import { useNavigate } from "@tanstack/react-router";
import {
	LuActivity,
	LuClock,
	LuGitPullRequest,
	LuSquareCheck,
	LuUsers,
} from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	CHANNEL_AGENT_STATES,
	useChannelAgents,
} from "../../../../hooks/useChannelAgents";
import {
	EMPTY_ACTIVITY,
	useChannelActivityStore,
} from "../../../../stores/channelActivityStore";
import {
	DEFAULT_COORDINATOR_AGENT,
	useChannelCoordinatorStore,
} from "../../../../stores/channelCoordinatorStore";
import type { ChannelPanePage } from "../../../../stores/channelPaneStore";
import { countNew } from "../../../../utils/activityEntries";
import {
	useChannelDevs,
	useChannelDevTurns,
	useChannelRoutines,
} from "../../hooks/useChannelDevs";
import { STATE_LABELS } from "../../utils/agentLabels";
import { coordinatorAgentLabel } from "../../utils/coordinatorAgents";
import { CoordinatorCard } from "../CoordinatorCard";
import { PaneRow } from "../PaneRow";
import { PaneSection } from "../PaneSection";
import { AddAgentMenu } from "./components/AddAgentMenu";
import { AgentRow } from "./components/AgentRow";

type ChannelSummary = RouterOutputs["channel"]["get"];

interface ChannelOverviewProps {
	channelId: string;
	channel: ChannelSummary;
	onOpen: (page: ChannelPanePage) => void;
}

/** The channel at a glance: who coordinates it, its agents by state, and where the rest lives. */
export function ChannelOverview({
	channelId,
	channel,
	onOpen,
}: ChannelOverviewProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const devs = useChannelDevs(channelId);
	const { turns: devTurns } = useChannelDevTurns(channelId, devs);
	const session = useChannelCoordinatorStore(
		(state) => state.byChannelId[channelId] ?? null,
	);
	const agentId = useChannelCoordinatorStore(
		(state) =>
			state.byChannelId[channelId]?.agentId ??
			state.settingsByChannelId[channelId]?.agentId ??
			DEFAULT_COORDINATOR_AGENT,
	);
	const { workspaces } = useHostWorkspaces();
	const sessionIn = session
		? (workspaces.find((row) => row.id === session.workspaceId)?.name ?? null)
		: null;
	const { agents } = useChannelAgents(channel.name);
	const routines = useChannelRoutines(channelId, devs);
	const { data: tasks } = cloudTrpc.channelTask.list.useQuery({ channelId });
	const activity = useChannelActivityStore(
		(state) => state.byChannelId[channelId] ?? EMPTY_ACTIVITY,
	);
	const newActivity = countNew(activity.events, activity.seenAt);
	const groups = CHANNEL_AGENT_STATES.map((state) => ({
		state,
		agents: agents.filter((agent) => agent.state === state),
	})).filter((group) => group.agents.length > 0);
	const openPrs = agents.filter(
		(agent) => agent.workspace.pr && agent.workspace.pr.state !== "merged",
	).length;

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-5 p-3">
				<CoordinatorCard
					sessionIn={sessionIn}
					agentLabel={coordinatorAgentLabel(agentId)}
					agents={agents}
					channelName={channel.name}
					onClick={() => onOpen({ kind: "coordinator" })}
				/>

				<PaneSection
					title={<Trans>Agents</Trans>}
					meta={agents.length || undefined}
					action={<AddAgentMenu channelName={channel.name} />}
				>
					{agents.length === 0 ? (
						<p className="px-2 py-1 text-[12px] leading-4 text-muted-foreground">
							<Trans>
								No agents yet. Tag a workspace with #{channel.name} and it shows
								up here, with what it needs from you.
							</Trans>
						</p>
					) : (
						groups.map(({ state, agents: group }) => (
							<div key={state} className="flex flex-col gap-px pt-1">
								{groups.length > 1 && (
									<div className="flex h-6 items-center gap-1.5 px-2 text-[10px] font-semibold tracking-[0.075em] text-muted-foreground uppercase">
										{t(STATE_LABELS[state])}
										<span className="font-medium tabular-nums">
											{group.length}
										</span>
									</div>
								)}
								{group.map((agent) => (
									<AgentRow
										key={agent.workspace.id}
										agent={agent}
										onOpen={(id) => onOpen({ kind: "agent", id })}
									/>
								))}
							</div>
						))
					)}
				</PaneSection>

				{devs.length > 0 && (
					<PaneSection title={<Trans>Devs</Trans>} meta={devs.length}>
						{devs.map((dev) => {
							const last = devTurns.find((turn) => turn.devId === dev.actorId);
							return (
								<PaneRow
									key={dev.actorId}
									leading={<DevAvatar avatar={dev.avatar} size={24} />}
									label={dev.name}
									detail={
										last
											? t({
													message: `Last replied ${formatCompactRelativeTime(new Date(last.startedAt))}`,
												})
											: t({ message: "Reads and posts here" })
									}
									onClick={() =>
										void navigate({
											to: "/devs/$devId",
											params: { devId: dev.actorId },
										})
									}
								/>
							);
						})}
					</PaneSection>
				)}

				<div className="flex flex-col divide-y divide-border overflow-hidden rounded-[10px] border border-border">
					<PaneRow
						className="rounded-none"
						leading={<LuGitPullRequest />}
						label={<Trans>Pull requests</Trans>}
						trailing={openPrs || undefined}
						onClick={() => onOpen({ kind: "pullRequests" })}
					/>
					<PaneRow
						className="rounded-none"
						leading={<LuClock />}
						label={<Trans>Automations</Trans>}
						trailing={routines.length || undefined}
						onClick={() => onOpen({ kind: "routines" })}
					/>
					<PaneRow
						className="rounded-none"
						leading={<LuSquareCheck />}
						label={<Trans>Tasks</Trans>}
						trailing={tasks?.length || undefined}
						onClick={() => onOpen({ kind: "tasks" })}
					/>
					<PaneRow
						className="rounded-none"
						leading={<LuUsers />}
						label={<Trans>People</Trans>}
						trailing={channel.memberCount}
						onClick={() => onOpen({ kind: "members" })}
					/>
					<PaneRow
						className="rounded-none"
						leading={<LuActivity />}
						label={<Trans>Activity</Trans>}
						trailing={
							newActivity > 0 ? (
								<span className="text-foreground">
									{t({ message: `${newActivity} new` })}
								</span>
							) : undefined
						}
						onClick={() => onOpen({ kind: "activity" })}
					/>
				</div>
			</div>
		</div>
	);
}

import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	LuArrowUpRight,
	LuChevronDown,
	LuClock,
	LuRefreshCw,
	LuRotateCcw,
} from "react-icons/lu";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useChannelAgents } from "../../../../hooks/useChannelAgents";
import {
	DEFAULT_COORDINATOR_AGENT,
	useChannelCoordinatorStore,
} from "../../../../stores/channelCoordinatorStore";
import type { ChannelPanePage } from "../../../../stores/channelPaneStore";
import { channelBrief } from "../../../ChannelView/utils/channelBrief";
import { useChannelDevs, useChannelRoutines } from "../../hooks/useChannelDevs";
import {
	COORDINATOR_AGENTS,
	coordinatorAgentLabel,
} from "../../utils/coordinatorAgents";
import { CoordinatorCard } from "../CoordinatorCard";
import { PaneRow } from "../PaneRow";
import { PaneSection } from "../PaneSection";
import { CoordinatorInstructions } from "./components/CoordinatorInstructions";

type ChannelSummary = RouterOutputs["channel"]["get"];

interface CoordinatorPageProps {
	channelId: string;
	channel: ChannelSummary;
	onOpen: (page: ChannelPanePage) => void;
}

/**
 * The channel's coordinator: which agent it runs as, the instructions it
 * starts with, the session it is now, and the automations and Devs around it.
 */
export function CoordinatorPage({
	channelId,
	channel,
	onOpen,
}: CoordinatorPageProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const devs = useChannelDevs(channelId);
	const session = useChannelCoordinatorStore(
		(state) => state.byChannelId[channelId] ?? null,
	);
	const settings = useChannelCoordinatorStore(
		(state) => state.settingsByChannelId[channelId],
	);
	const setSettings = useChannelCoordinatorStore((state) => state.setSettings);
	const setPendingPrompts = useChannelCoordinatorStore(
		(state) => state.setPendingPrompts,
	);
	const unlink = useChannelCoordinatorStore((state) => state.unlink);
	const { agents } = useChannelAgents(channel.name);
	const automations = useChannelRoutines(channelId, devs);
	const { workspaces } = useHostWorkspaces();
	const sessionWorkspace = session
		? workspaces.find((row) => row.id === session.workspaceId)
		: undefined;
	const agentId =
		session?.agentId ?? settings?.agentId ?? DEFAULT_COORDINATOR_AGENT;
	const [confirmingRestart, setConfirmingRestart] = useState(false);
	const rebrief = () => {
		if (!session) return;
		const brief = channelBrief({
			channelName: channel.name,
			goal: channel.description ?? null,
			projectId: sessionWorkspace?.projectId ?? null,
			instructions: settings?.instructions ?? "",
		});
		setPendingPrompts(channelId, [
			...session.pendingPrompts,
			[
				{ type: "text", text: brief, hidden: true },
				{
					type: "text",
					text: t({
						message:
							"Re-brief: read the goal and rules again, then tell me in two lines where the channel stands.",
					}),
				},
			],
		]);
	};
	const applies = session ? (
		<Trans>Takes effect on the next session</Trans>
	) : (
		<Trans>Takes effect when it starts</Trans>
	);

	return (
		<div className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex flex-col gap-5 p-3">
				<CoordinatorCard
					sessionIn={session ? (sessionWorkspace?.name ?? null) : null}
					agentLabel={coordinatorAgentLabel(agentId)}
					agents={agents}
					channelName={channel.name}
				/>

				<PaneSection title={<Trans>Agent</Trans>}>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-fill-hover"
							>
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate text-[13px] leading-[18px] font-medium">
										{coordinatorAgentLabel(agentId)}
									</span>
									<span className="truncate text-[12px] leading-4 text-muted-foreground">
										{applies}
									</span>
								</span>
								<LuChevronDown className="size-3.5 shrink-0 text-muted-foreground/60" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-48">
							{COORDINATOR_AGENTS.map((agent) => (
								<DropdownMenuItem
									key={agent.id}
									onSelect={() => setSettings(channelId, { agentId: agent.id })}
								>
									{agent.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</PaneSection>

				<PaneSection title={<Trans>Instructions</Trans>}>
					<div className="px-2">
						<CoordinatorInstructions
							value={settings?.instructions ?? ""}
							onSave={(instructions) =>
								setSettings(channelId, { instructions })
							}
						/>
					</div>
				</PaneSection>

				<PaneSection title={<Trans>Session</Trans>}>
					{session ? (
						<>
							<PaneRow
								leading={<LuArrowUpRight />}
								label={sessionWorkspace?.name ?? t({ message: "Workspace" })}
								detail={
									session.sessionId ? (
										<Trans>Open it in its workspace</Trans>
									) : (
										<Trans>Starting…</Trans>
									)
								}
								onClick={() =>
									void navigateToV2Workspace(session.workspaceId, navigate, {
										search: session.sessionId
											? {
													sessionId: session.sessionId,
													focusRequestId: crypto.randomUUID(),
												}
											: {},
									})
								}
							/>
							<div className="flex flex-wrap gap-2 pt-2 pr-2 pl-11">
								<button
									type="button"
									onClick={rebrief}
									title={t({ message: "Send it the goal and the rules again" })}
									className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium transition-colors hover:bg-fill-hover [&_svg]:size-3.5"
								>
									<LuRefreshCw />
									<Trans>Re-brief</Trans>
								</button>
								<button
									type="button"
									onClick={() => setConfirmingRestart(true)}
									title={t({
										message:
											"Begin a fresh session; this one stays in its workspace",
									})}
									className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground [&_svg]:size-3.5"
								>
									<LuRotateCcw />
									<Trans>Start over</Trans>
								</button>
							</div>
						</>
					) : (
						<p className="px-2 py-1 text-[12px] leading-4 text-muted-foreground">
							<Trans>
								Not started. The channel asks where to run it and what to do.
							</Trans>
						</p>
					)}
				</PaneSection>

				<PaneSection title={<Trans>In this channel</Trans>}>
					<PaneRow
						leading={<LuClock />}
						label={<Trans>Automations</Trans>}
						detail={
							automations.length === 0 ? <Trans>None yet</Trans> : undefined
						}
						trailing={automations.length || undefined}
						onClick={() => onOpen({ kind: "routines" })}
					/>
					{devs.map((member) => (
						<PaneRow
							key={member.actorId}
							leading={<DevAvatar avatar={member.avatar} size={24} />}
							label={member.name}
							detail={<Trans>Reads and posts here</Trans>}
							onClick={() =>
								void navigate({
									to: "/devs/$devId",
									params: { devId: member.actorId },
								})
							}
						/>
					))}
				</PaneSection>
			</div>
			<DiscardConfirmDialog
				open={confirmingRestart}
				onOpenChange={setConfirmingRestart}
				title={t({ message: "Start the coordinator over?" })}
				description={t({
					message:
						"This session stays in its workspace. The next one starts with the agent and instructions above.",
				})}
				confirmLabel={t({ message: "Start over" })}
				onConfirm={() => unlink(channelId)}
			/>
		</div>
	);
}

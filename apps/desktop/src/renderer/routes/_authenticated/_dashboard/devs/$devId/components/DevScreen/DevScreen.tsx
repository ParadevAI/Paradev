import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChannelComposer } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelComposer";
import {
	ChannelPane,
	type PanePageView,
} from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelPane";
import { ChannelPanelFrame } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelPanelFrame";
import type { ChannelPerson } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/MessageBody";
import { useChannelPaneMode } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useChannelPaneMode";
import { useElementWidth } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useElementWidth";
import {
	type ChannelPanePage,
	useChannelPaneStore,
} from "renderer/routes/_authenticated/_dashboard/channels/$channelId/stores/channelPaneStore";
import { CustomizeDevDialog } from "renderer/routes/_authenticated/_dashboard/components/CustomizeDevDialog";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useViewedChannelStore } from "renderer/routes/_authenticated/stores/viewedChannelStore";
import { DevActivityTab } from "../DevActivityTab";
import { DevConversation } from "../DevConversation";
import { DevHeader } from "../DevHeader";
import { DevIntro } from "../DevIntro";
import { DevProfile } from "../DevProfile";
import { RoutinesPage } from "../DevProfile/components/RoutinesPage";

/** A Dev's page: the conversation with it in the middle, its profile in the pane. */
export function DevScreen({ devId }: { devId: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [isCustomizing, setCustomizing] = useState(false);
	const [isArchiving, setArchiving] = useState(false);
	const { data: dev } = cloudTrpc.agent.get.useQuery({ agentId: devId });
	const openDm = cloudTrpc.agent.openDirectMessage.useMutation();
	const { mutate: openDmMutate } = openDm;
	useEffect(() => {
		openDmMutate({ agentId: devId });
	}, [devId, openDmMutate]);
	const channelId = openDm.data?.channelId ?? null;
	const channelQuery = cloudTrpc.channel.get.useQuery(
		{ channelId: channelId ?? "" },
		{ enabled: channelId !== null, retry: false },
	);
	const channel = channelQuery.data;
	useEffect(() => {
		if (!channelId) return;
		const store = useChannelPaneStore.getState();
		if (!store.panes[channelId]) store.setOpen(channelId, true);
	}, [channelId]);
	const setViewedChannel = useViewedChannelStore((state) => state.setChannelId);
	useEffect(() => {
		setViewedChannel(channelId);
		return () => setViewedChannel(null);
	}, [channelId, setViewedChannel]);
	const push = useChannelPaneStore((state) => state.push);
	const reset = useChannelPaneStore((state) => state.reset);
	const setOpen = useChannelPaneStore((state) => state.setOpen);
	const paneWidth = useChannelPaneStore((state) => state.width);
	const setPaneWidth = useChannelPaneStore((state) => state.setWidth);
	const pane = useChannelPaneMode(channelId ?? "");
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const containerWidth = useElementWidth(container) ?? 0;
	const { people, currentUserId } = useOrganizationPeople();
	const peopleById = useMemo(
		() => new Map<string, ChannelPerson>(people.map((p) => [p.id, p])),
		[people],
	);
	const now = useMemo(() => new Date(), []);

	const options = {
		onSuccess: () => void utils.agent.invalidate(),
		onError: (error: unknown) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	};
	const pause = cloudTrpc.agent.pause.useMutation(options);
	const resume = cloudTrpc.agent.resume.useMutation(options);
	const archive = cloudTrpc.agent.archive.useMutation({
		...options,
		onSuccess: () => {
			void utils.agent.invalidate();
			void navigate({ to: "/v2-workspaces" });
		},
	});

	const renderPanePage = useCallback(
		(page: ChannelPanePage): PanePageView | null => {
			if (!channelId) return null;
			if (page.kind === "activity") {
				return {
					title: <Trans>Activity</Trans>,
					content: (
						<DevActivityTab
							devId={devId}
							onOpenChat={() => setOpen(channelId, false)}
						/>
					),
				};
			}
			if (page.kind === "routines") {
				return {
					title: <Trans>Automations</Trans>,
					content: <RoutinesPage devId={devId} />,
				};
			}
			return null;
		},
		[channelId, devId, setOpen],
	);

	if (!dev || !channelId || !channel) return <StateScreenShell />;
	const name = dev.name;
	const togglePause = () =>
		dev.pausedAt !== null
			? resume.mutate({ agentId: dev.id })
			: pause.mutate({ agentId: dev.id });
	const canPost = channel.membership != null && channel.archivedAt === null;

	return (
		<div
			ref={setContainer}
			data-channel-screen
			className="@container flex h-full w-full min-w-0 flex-1 overflow-hidden"
		>
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<DevHeader
					dev={dev}
					pane={{ isOpen: pane.isOpen, toggle: pane.toggle }}
					onOpenProfile={() => {
						reset(channelId);
						setOpen(channelId, true);
					}}
					onOpenActivity={() => push(channelId, { kind: "activity" })}
					onCustomize={() => setCustomizing(true)}
					onTogglePause={togglePause}
					onArchive={() => setArchiving(true)}
				/>
				<DevConversation
					channelId={channelId}
					dev={dev}
					peopleById={peopleById}
					currentUserId={currentUserId}
					intro={<DevIntro dev={dev} compact={pane.isOpen} />}
				/>
				{canPost && currentUserId && (
					<div className="shrink-0 px-4 pb-4">
						<div className="mx-auto w-full max-w-[720px]">
							<ChannelComposer
								channelId={channelId}
								threadRootId={null}
								people={people}
								currentUserId={currentUserId}
								placeholder={t({ message: `Message ${name}` })}
								autoFocus
								compact
							/>
						</div>
					</div>
				)}
			</div>
			<ChannelPanelFrame
				mode={pane.mode}
				containerWidth={containerWidth}
				width={paneWidth}
				onWidthChange={setPaneWidth}
				onCollapse={pane.hide}
			>
				<ChannelPane
					channelId={channelId}
					channel={channel}
					isFullScreen={pane.mode === "expanded"}
					onToggleFullScreen={pane.toggleFullScreen}
					onHide={pane.hide}
					peopleById={peopleById}
					people={people}
					currentUserId={currentUserId}
					canModerate={channel.canManage}
					canPost={canPost}
					now={now}
					onLeave={() => {}}
					onArchive={() => setArchiving(true)}
					root={{
						title: <span className="truncate">{name}</span>,
						content: (
							<DevProfile
								dev={dev}
								onCustomize={() => setCustomizing(true)}
								onOpen={(page) => push(channelId, page)}
							/>
						),
					}}
					renderPage={renderPanePage}
				/>
			</ChannelPanelFrame>
			<CustomizeDevDialog
				open={isCustomizing}
				onOpenChange={setCustomizing}
				dev={{ id: dev.id, name: dev.name, avatar: dev.avatar }}
			/>
			<DiscardConfirmDialog
				open={isArchiving}
				onOpenChange={setArchiving}
				title={t({ message: `Archive ${name}?` })}
				description={t({
					message:
						"It loses all its access at once. Its chats and the work it made are kept.",
				})}
				confirmLabel={t({ message: "Archive" })}
				onConfirm={() => archive.mutate({ agentId: dev.id })}
			/>
		</div>
	);
}

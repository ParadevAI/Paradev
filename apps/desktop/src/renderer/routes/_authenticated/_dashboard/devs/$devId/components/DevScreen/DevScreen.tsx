import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChannelScreen } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelScreen";
import { useChannelPanelStore } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/stores/channelPanelStore";
import { CustomizeDevDialog } from "renderer/routes/_authenticated/_dashboard/components/CustomizeDevDialog";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { DevActivityTab } from "../DevActivityTab";
import { DevHeader, type DevTab } from "../DevHeader";
import { DevIntro } from "../DevIntro";
import { DevPanel } from "../DevPanel";

/** A Dev's page is its DM room, with the Dev's profile as the side panel. */
export function DevScreen({ devId }: { devId: string }) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [tab, setTab] = useState<DevTab>("chat");
	const [isCustomizing, setCustomizing] = useState(false);
	const [isArchiving, setArchiving] = useState(false);
	const { data: dev } = cloudTrpc.agent.get.useQuery({ agentId: devId });
	const openDm = cloudTrpc.agent.openDirectMessage.useMutation();
	const { mutate: openDmMutate } = openDm;
	useEffect(() => {
		openDmMutate({ agentId: devId });
	}, [devId, openDmMutate]);
	const channelId = openDm.data?.channelId;
	useEffect(() => {
		if (!channelId) return;
		const store = useChannelPanelStore.getState();
		if (!store.panels[channelId]) store.setOpen(channelId, true);
	}, [channelId]);

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

	if (!dev || !channelId) return null;
	const name = dev.name;
	const togglePause = () =>
		dev.pausedAt !== null
			? resume.mutate({ agentId: dev.id })
			: pause.mutate({ agentId: dev.id });

	return (
		<div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
			<ChannelScreen
				key={channelId}
				channelId={channelId}
				renderHeader={(panel) => (
					<DevHeader
						dev={dev}
						tab={tab}
						onTabChange={setTab}
						panel={panel}
						onCustomize={() => setCustomizing(true)}
						onTogglePause={togglePause}
						onArchive={() => setArchiving(true)}
					/>
				)}
				renderPanel={({ hide }) => (
					<DevPanel
						dev={dev}
						onHide={hide}
						onCustomize={() => setCustomizing(true)}
					/>
				)}
				body={
					tab === "activity" ? (
						<DevActivityTab devId={dev.id} onOpenChat={() => setTab("chat")} />
					) : undefined
				}
				intro={<DevIntro dev={dev} />}
				composerPlaceholder={t({ message: `Message ${name}` })}
			/>
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

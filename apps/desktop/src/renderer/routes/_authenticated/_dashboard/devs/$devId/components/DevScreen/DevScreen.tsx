import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { ChannelScreen } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/ChannelScreen";
import { CustomizeDevDialog } from "renderer/routes/_authenticated/_dashboard/components/CustomizeDevDialog";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { DevDetailsDialog, type DevDetailsTab } from "../DevDetailsDialog";
import { DevHeader, type DevTab } from "../DevHeader";
import { DevIntro } from "../DevIntro";
import { DevWorkTab } from "../DevWorkTab";

interface DevScreenProps {
	devId: string;
	details?: DevDetailsTab;
}

/** A Dev's page is its DM room, drawn with the Dev's header and intro. */
export function DevScreen({ devId, details }: DevScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [tab, setTab] = useState<DevTab>("chat");
	const [isCustomizing, setCustomizing] = useState(false);
	const [isArchiving, setArchiving] = useState(false);
	const { data: dev } = cloudTrpc.agent.get.useQuery(
		{ agentId: devId },
		{ refetchInterval: 15_000 },
	);
	const openDm = cloudTrpc.agent.openDirectMessage.useMutation();
	const { mutate: openDmMutate } = openDm;
	useEffect(() => {
		openDmMutate({ agentId: devId });
	}, [devId, openDmMutate]);
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
	const openDetails = (next: DevDetailsTab | undefined) =>
		void navigate({
			to: "/devs/$devId",
			params: { devId },
			search: next ? { details: next } : {},
			replace: true,
		});

	if (!dev) return null;
	const name = dev.name;
	const isPaused = dev.pausedAt !== null;
	const togglePause = () =>
		isPaused
			? resume.mutate({ agentId: dev.id })
			: pause.mutate({ agentId: dev.id });
	const header = (panel: { isOpen: boolean; toggle: () => void } | null) => (
		<DevHeader
			dev={dev}
			tab={tab}
			onTabChange={setTab}
			panel={panel}
			onCustomize={() => setCustomizing(true)}
			onOpenDetails={() => openDetails("about")}
			onTogglePause={togglePause}
			onArchive={() => setArchiving(true)}
		/>
	);
	const channelId = openDm.data?.channelId;

	return (
		<div className="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden">
			{tab === "chat" && channelId ? (
				<ChannelScreen
					key={channelId}
					channelId={channelId}
					renderHeader={header}
					intro={<DevIntro dev={dev} />}
					composerPlaceholder={t({ message: `Message ${name}` })}
				/>
			) : (
				<>
					{header(null)}
					{tab === "work" && <DevWorkTab dev={dev} />}
				</>
			)}
			<CustomizeDevDialog
				open={isCustomizing}
				onOpenChange={setCustomizing}
				dev={{ id: dev.id, name: dev.name, avatar: dev.avatar }}
			/>
			<DevDetailsDialog
				dev={dev}
				tab={details}
				onTabChange={openDetails}
				onCustomize={() => setCustomizing(true)}
				onTogglePause={togglePause}
				onArchive={() => setArchiving(true)}
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

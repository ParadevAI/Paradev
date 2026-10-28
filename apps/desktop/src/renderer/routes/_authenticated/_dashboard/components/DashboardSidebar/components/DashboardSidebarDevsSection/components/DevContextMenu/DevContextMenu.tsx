import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import type { RouterOutputs } from "@superset/trpc";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import {
	LuArchive,
	LuCirclePause,
	LuCirclePlay,
	LuPencil,
} from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { CustomizeDevDialog } from "renderer/routes/_authenticated/_dashboard/components/CustomizeDevDialog";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";

type SidebarDev = RouterOutputs["agent"]["list"][number];

interface DevContextMenuProps {
	dev: SidebarDev;
	/** The Dev on screen; archiving it moves away, as it no longer loads. */
	isActive: boolean;
	children: ReactNode;
}

export function DevContextMenu({
	dev,
	isActive,
	children,
}: DevContextMenuProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const utils = cloudTrpc.useUtils();
	const [isCustomizing, setCustomizing] = useState(false);
	const [isArchiving, setArchiving] = useState(false);
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
			if (isActive) void navigate({ to: "/v2-workspaces" });
		},
	});
	const isPaused = dev.pausedAt !== null;
	const name = dev.name;

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div>{children}</div>
				</ContextMenuTrigger>
				<ContextMenuContent
					className="w-52"
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					<ContextMenuItem onSelect={() => setCustomizing(true)}>
						<LuPencil className="size-4" />
						<Trans>Customize</Trans>
					</ContextMenuItem>
					<ContextMenuSeparator />
					{isPaused ? (
						<ContextMenuItem
							onSelect={() => resume.mutate({ agentId: dev.id })}
						>
							<LuCirclePlay className="size-4" />
							<Trans>Resume</Trans>
						</ContextMenuItem>
					) : (
						<ContextMenuItem onSelect={() => pause.mutate({ agentId: dev.id })}>
							<LuCirclePause className="size-4" />
							<Trans>Pause</Trans>
						</ContextMenuItem>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem
						variant="destructive"
						onSelect={() => setArchiving(true)}
					>
						<LuArchive className="size-4" />
						<Trans>Archive</Trans>
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
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
		</>
	);
}

import { Trans, useLingui } from "@lingui/react/macro";
import type { SelectScreenshot } from "@superset/local-db";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { LuCopy, LuMessageSquarePlus } from "react-icons/lu";
import { DeviceControlButton } from "../../../DeviceControlButton";
import { useScreenshotActions } from "./hooks/useScreenshotActions";

interface ScreenshotThumbProps {
	shot: SelectScreenshot;
	workspaceId: string;
	className?: string;
}

export function ScreenshotThumb({
	shot,
	workspaceId,
	className,
}: ScreenshotThumbProps) {
	const { t } = useLingui();
	const actions = useScreenshotActions(workspaceId, shot.id);
	const { attachToChat } = actions;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<div
					className={cn(
						"group/thumb relative overflow-hidden rounded-md border border-border bg-muted",
						className,
					)}
				>
					<button
						type="button"
						draggable
						onDragStart={(event) => {
							event.preventDefault();
							actions.startDrag();
						}}
						aria-label={shot.filename}
						onClick={actions.open}
						className="block size-full"
					>
						<img
							src={shot.thumbnail}
							alt=""
							draggable={false}
							className="block size-full object-cover"
						/>
					</button>
					<div className="pointer-events-none absolute inset-0 flex items-end justify-center gap-0.5 bg-linear-to-t from-black/85 via-black/30 to-transparent pb-1.5 opacity-0 transition-opacity group-hover/thumb:opacity-100 group-hover/thumb:[&_button]:pointer-events-auto [&_button]:text-white/80 [&_button:hover]:text-white">
						{attachToChat && (
							<DeviceControlButton
								compact
								label={t({ message: "Attach to chat" })}
								side="top"
								onClick={() => void attachToChat()}
							>
								<LuMessageSquarePlus className="size-3.5" />
							</DeviceControlButton>
						)}
						<DeviceControlButton
							compact
							label={t({ message: "Copy" })}
							side="top"
							onClick={() => void actions.copy()}
						>
							<LuCopy className="size-3.5" />
						</DeviceControlButton>
					</div>
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				{attachToChat && (
					<ContextMenuItem onSelect={() => void attachToChat()}>
						<Trans>Attach to chat</Trans>
					</ContextMenuItem>
				)}
				<ContextMenuItem onSelect={() => void actions.copy()}>
					<Trans>Copy</Trans>
				</ContextMenuItem>
				<ContextMenuItem onSelect={actions.showInFolder}>
					<Trans>Show in folder</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

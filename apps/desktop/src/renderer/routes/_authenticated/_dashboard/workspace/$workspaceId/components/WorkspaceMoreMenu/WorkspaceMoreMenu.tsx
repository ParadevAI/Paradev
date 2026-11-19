import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useRunAfterMenuClose } from "@superset/ui/hooks/use-run-after-menu-close";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { Container, Ellipsis, Play, Settings, Square, X } from "lucide-react";
import { useRef, useState } from "react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";
import { useWorkspaceMoveDirections } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";
import { RenameDialog } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/components/RenameDialog";
import { useOptimisticActions } from "renderer/routes/_authenticated/hooks/useOptimisticActions";
import type { WorkspaceRunDefinition } from "shared/workspace-run-definition";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { useConfigureWorkspaceRun } from "../../hooks/useConfigureWorkspaceRun";
import { WorkspaceMoreMenuItems } from "./components/WorkspaceMoreMenuItems";

interface WorkspaceMoreMenuProps {
	projectId: string | null;
	runDefinition: WorkspaceRunDefinition | null;
	isRunning: boolean;
	isRunPending: boolean;
	canForceStop: boolean;
	onToggleRun: () => void | Promise<void>;
	onForceStopRun: () => void | Promise<void>;
}

export function WorkspaceMoreMenu({
	projectId,
	runDefinition,
	isRunning,
	isRunPending,
	canForceStop,
	onToggleRun,
	onForceStopRun,
}: WorkspaceMoreMenuProps) {
	const { t } = useLingui();
	const configureRun = useConfigureWorkspaceRun(projectId, runDefinition);
	const runHotkey = useHotkeyDisplay("RUN_WORKSPACE_COMMAND").text;
	const hasRunCommand = (runDefinition?.commands ?? []).length > 0;
	const label = t({ message: "More actions" });
	const { workspace } = useWorkspace();
	const { v2Workspaces: workspaceActions } = useOptimisticActions();
	const moveDirections = useWorkspaceMoveDirections(workspace.hostId);
	const [rename, setRename] = useState<{ cloud: boolean } | null>(null);
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const actionPendingRef = useRef(false);
	const openAfterClose = (action: () => void) => {
		actionPendingRef.current = true;
		runAfterClose(action);
	};
	const environment = useWorkspaceEnvironment(workspace.id);
	const navigate = useNavigate();

	const runItems = (
		<>
			<DropdownMenuItem
				disabled={isRunPending}
				onClick={() => {
					if (!hasRunCommand && !isRunning) {
						configureRun();
						return;
					}
					void onToggleRun();
				}}
			>
				{isRunning ? (
					<Square className="size-4" />
				) : hasRunCommand ? (
					<Play className="size-4" />
				) : (
					<Settings className="size-4" />
				)}
				{isRunning ? (
					<Trans>Stop</Trans>
				) : hasRunCommand ? (
					<Trans>Run</Trans>
				) : (
					<Trans>Set Run</Trans>
				)}
				{(isRunning || hasRunCommand) && runHotkey !== "Unassigned" && (
					<DropdownMenuShortcut>{runHotkey}</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			{canForceStop && (
				<DropdownMenuItem
					onClick={() => void onForceStopRun()}
					className="text-destructive focus:text-destructive"
				>
					<X className="size-4 text-destructive" />
					<Trans>Force Stop</Trans>
				</DropdownMenuItem>
			)}
			{(isRunning || hasRunCommand) && (
				<DropdownMenuItem onClick={configureRun}>
					<Settings className="size-4" />
					{runDefinition?.source === "terminal-preset" ? (
						<Trans>Edit Run Script</Trans>
					) : (
						<Trans>Configure</Trans>
					)}
				</DropdownMenuItem>
			)}
			{environment && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() =>
							void navigate({
								to: "/settings/environments/$environmentId",
								params: { environmentId: environment.id },
							})
						}
					>
						<Container className="size-4" />
						<Trans>Manage environment</Trans>
					</DropdownMenuItem>
				</>
			)}
		</>
	);

	return (
		<>
			<DropdownMenu>
				<Tooltip delayDuration={500}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={label}
								className="no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground aria-expanded:bg-foreground/15 aria-expanded:text-foreground aria-expanded:hover:bg-foreground/20"
							>
								<Ellipsis className="size-4" strokeWidth={1.5} />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">{label}</TooltipContent>
				</Tooltip>
				<DropdownMenuContent
					align="end"
					className="min-w-56"
					onCloseAutoFocus={(event) => {
						if (!actionPendingRef.current) return;
						actionPendingRef.current = false;
						onCloseAutoFocus(event);
					}}
				>
					<WorkspaceMoreMenuItems
						workspace={workspace}
						runItems={runItems}
						moveDirections={moveDirections}
						onRename={(target) => openAfterClose(() => setRename(target))}
					/>
				</DropdownMenuContent>
			</DropdownMenu>
			{rename && (
				<RenameDialog
					name={workspace.name}
					title={t({ message: "Rename workspace" })}
					description={t({ message: "The name shows in the sidebar." })}
					inputLabel={t({ message: "Workspace name" })}
					onClose={() => setRename(null)}
					onSubmit={(name) => {
						const trimmed = name.trim();
						if (!trimmed) return;
						workspaceActions.renameWorkspace(workspace.id, trimmed, rename);
					}}
				/>
			)}
		</>
	);
}

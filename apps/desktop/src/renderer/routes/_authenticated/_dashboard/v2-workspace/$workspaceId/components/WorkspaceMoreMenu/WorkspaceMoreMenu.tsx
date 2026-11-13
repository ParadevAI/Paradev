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
import {
	CloudUpload,
	Container,
	DatabaseBackup,
	Ellipsis,
	Laptop,
	Play,
	Settings,
	Square,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { authClient } from "renderer/lib/auth-client";
import { MoveWorkspaceDialog } from "renderer/routes/_authenticated/_dashboard/components/MoveWorkspaceDialog";
import { useWorkspaceEnvironment } from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceEnvironment";
import {
	useWorkspaceMoveDirections,
	type WorkspaceMoveDirection,
} from "renderer/routes/_authenticated/_dashboard/hooks/useWorkspaceMoveDirections";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceRunDefinition } from "shared/workspace-run-definition";
import { useWorkspace } from "../../../providers/WorkspaceProvider";
import { useConfigureWorkspaceRun } from "../../hooks/useConfigureWorkspaceRun";
import { useWorkspaceOpenIn } from "../../hooks/useWorkspaceOpenIn";
import { useWorkspaceOpenInTarget } from "../../hooks/useWorkspaceOpenInTarget";
import { SaveCheckpointDialog } from "./components/SaveCheckpointDialog";
import { WorkspaceOpenInItems } from "./components/WorkspaceOpenInItems";

interface WorkspaceMoreMenuProps {
	workspaceId: string;
	projectId: string | null;
	runDefinition: WorkspaceRunDefinition | null;
	isRunning: boolean;
	isRunPending: boolean;
	canForceStop: boolean;
	onToggleRun: () => void | Promise<void>;
	onForceStopRun: () => void | Promise<void>;
}

export function WorkspaceMoreMenu({
	workspaceId,
	projectId,
	runDefinition,
	isRunning,
	isRunPending,
	canForceStop,
	onToggleRun,
	onForceStopRun,
}: WorkspaceMoreMenuProps) {
	const { t } = useLingui();
	const openInTarget = useWorkspaceOpenInTarget(workspaceId);
	const openIn = useWorkspaceOpenIn({
		worktreePath: openInTarget?.worktreePath ?? null,
		projectId,
	});
	const configureRun = useConfigureWorkspaceRun(projectId, runDefinition);
	const runHotkey = useHotkeyDisplay("RUN_WORKSPACE_COMMAND").text;
	const hasRunCommand = (runDefinition?.commands ?? []).length > 0;
	const label = t({ message: "More actions" });
	const { workspace } = useWorkspace();
	const moveDirections = useWorkspaceMoveDirections(workspace.hostId);
	const { machineId } = useLocalHostService();
	const [moveOpen, setMoveOpen] = useState<WorkspaceMoveDirection | null>(null);
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const actionPendingRef = useRef(false);
	const openAfterClose = (action: () => void) => {
		actionPendingRef.current = true;
		runAfterClose(action);
	};
	const environment = useWorkspaceEnvironment(workspaceId);
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const isWorkspaceReady =
		cloudWorkspaces?.find((row) => row.id === workspaceId)?.status === "ready";
	const { data: session } = authClient.useSession();
	const isAdmin = useIsOrganizationAdmin() === true;
	const canSaveCheckpoint =
		!!environment &&
		(environment.scope !== "organization" ||
			environment.createdByUserId === session?.user?.id ||
			isAdmin);
	const [checkpointOpen, setCheckpointOpen] = useState(false);
	const navigate = useNavigate();

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
					{openInTarget && (
						<>
							<WorkspaceOpenInItems openIn={openIn} />
							<DropdownMenuSeparator />
						</>
					)}
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
							{canSaveCheckpoint && (
								<DropdownMenuItem
									disabled={!isWorkspaceReady}
									onSelect={() => openAfterClose(() => setCheckpointOpen(true))}
								>
									<DatabaseBackup className="size-4" />
									<Trans>Save checkpoint</Trans>
								</DropdownMenuItem>
							)}
						</>
					)}
					{moveDirections.length > 0 && <DropdownMenuSeparator />}
					{moveDirections.map((direction) => (
						<DropdownMenuItem
							key={direction}
							onSelect={() => openAfterClose(() => setMoveOpen(direction))}
						>
							{direction === "to-cloud" ? (
								<>
									<CloudUpload className="size-4" />
									<Trans>Move to cloud</Trans>
								</>
							) : (
								<>
									<Laptop className="size-4" />
									{workspace.hostId === machineId ? (
										<Trans>Move to another computer</Trans>
									) : (
										<Trans>Move to a computer</Trans>
									)}
								</>
							)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
			{environment && canSaveCheckpoint && (
				<SaveCheckpointDialog
					cloudWorkspaceId={workspaceId}
					environment={environment}
					open={checkpointOpen}
					onOpenChange={setCheckpointOpen}
				/>
			)}
			{moveOpen && (
				<MoveWorkspaceDialog
					direction={moveOpen}
					workspace={{
						id: workspaceId,
						hostId: workspace.hostId,
						projectId: workspace.projectId,
						name: workspace.name,
					}}
					open
					onOpenChange={(open) => {
						if (!open) setMoveOpen(null);
					}}
				/>
			)}
		</>
	);
}

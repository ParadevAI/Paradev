import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import {
	ChevronDown,
	ExternalLink,
	FileText,
	GitCompare,
	Minus,
	Plus,
	SquarePlus,
	Trash2,
	Undo2,
} from "lucide-react";
import { memo, useState } from "react";
import {
	modifierLabel,
	useChangesSidebarFilePolicy,
} from "renderer/lib/clickPolicy";
import { ChangedFileRow } from "renderer/routes/_authenticated/_dashboard/components/ChangedFileRow";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { PathActionsMenuItems } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/PathActionsMenuItems";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import { useFileDrag } from "../../hooks/useFileDrag";
import { useStagingMutations } from "../../hooks/useStagingMutations";
import { StageToggleButton } from "../StageToggleButton";

interface FileRowProps {
	file: ChangesetFile;
	workspaceId: string;
	worktreePath?: string;
	/** Hide the directory prefix — used when the row sits under a folder group. */
	hideDir?: boolean;
	/** Highlight as the diff pane's currently open file. */
	isSelected?: boolean;
	onSelect?: (path: string, openInNewTab?: boolean, changeKey?: string) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

export const FileRow = memo(function FileRow({
	file,
	workspaceId,
	worktreePath,
	hideDir,
	isSelected,
	onSelect,
	onOpenFile,
	onOpenInEditor,
}: FileRowProps) {
	const { t } = useLingui();
	const basename = file.path.slice(file.path.lastIndexOf("/") + 1);
	const isRename = file.status === "renamed" || file.status === "copied";
	const absolutePath = worktreePath
		? toAbsoluteWorkspacePath(worktreePath, file.path)
		: undefined;
	const changeKey = getChangesetFileKey(file);
	const canStage = file.source.kind === "unstaged";
	const canUnstage = file.source.kind === "staged";
	const canDiscard = canStage;
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	const isDeleteAction = file.status === "untracked" || file.status === "added";
	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: () => {
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		onError: (err) => {
			toast.error(
				t({
					message: "Couldn't discard changes",
				}),
				{
					description: errorMessage(err),
				},
			);
		},
	});
	const confirmDiscard = () => {
		setShowDiscardConfirm(false);
		discardMutation.mutate({ workspaceId, filePath: file.path });
	};
	const { stageFile, unstageFile } = useStagingMutations(workspaceId);

	const policy = useChangesSidebarFilePolicy();
	const diffNewTabTier = policy.tierForIntent("diffNewTab");
	const fileTier = policy.tierForIntent("file");
	const externalTier = policy.tierForIntent("external");
	const fileDrag = useFileDrag({ absolutePath });

	const rowButton = (
		<div className="group relative">
			<ChangedFileRow
				path={file.path}
				oldPath={isRename ? file.oldPath : undefined}
				status={file.status}
				additions={file.additions}
				deletions={file.deletions}
				hideDir={hideDir}
				isSelected={isSelected}
				hasHoverActions
				{...fileDrag}
				onClick={(e) => {
					const intent = policy.getIntent(e);
					if (intent === "external") onOpenInEditor?.(file.path);
					else if (intent === "file" && absolutePath)
						onOpenFile?.(absolutePath, false);
					else if (intent === "diffNewTab")
						onSelect?.(file.path, true, changeKey);
					else if (intent === "diff") onSelect?.(file.path, false, changeKey);
				}}
			/>
			<div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-0.5 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100">
				{canDiscard && (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={t({
									message: "Discard changes",
								})}
								className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
								onClick={(e) => {
									e.stopPropagation();
									setShowDiscardConfirm(true);
								}}
							>
								<Undo2 className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top">
							<Trans>Discard changes</Trans>
						</TooltipContent>
					</Tooltip>
				)}
				{canStage && (
					<StageToggleButton action="stage" onClick={() => stageFile(file)} />
				)}
				{canUnstage && (
					<StageToggleButton
						action="unstage"
						onClick={() => unstageFile(file)}
					/>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({
								message: "More actions",
							})}
							className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
							onClick={(e) => e.stopPropagation()}
						>
							<ChevronDown className="size-3.5" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuItem
							onSelect={() => onSelect?.(file.path, false, changeKey)}
						>
							<GitCompare />
							<Trans>Open Diff</Trans>
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => onSelect?.(file.path, true, changeKey)}
						>
							<SquarePlus />
							<Trans>Open Diff in New Tab</Trans>
							{diffNewTabTier && (
								<DropdownMenuShortcut>
									{modifierLabel(diffNewTabTier)}
								</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
							disabled={!onOpenFile || !absolutePath}
						>
							<FileText />
							<Trans>Open File</Trans>
							{fileTier && (
								<DropdownMenuShortcut>
									{modifierLabel(fileTier)}
								</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
							disabled={!onOpenFile || !absolutePath}
						>
							<SquarePlus />
							<Trans>Open File in New Tab</Trans>
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => onOpenInEditor?.(file.path)}
							disabled={!onOpenInEditor}
						>
							<ExternalLink />
							<Trans>Open in Editor</Trans>
							{externalTier && (
								<DropdownMenuShortcut>
									{modifierLabel(externalTier)}
								</DropdownMenuShortcut>
							)}
						</DropdownMenuItem>
						{canStage && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => stageFile(file)}>
									<Plus />
									<Trans>Stage file</Trans>
								</DropdownMenuItem>
							</>
						)}
						{canUnstage && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => unstageFile(file)}>
									<Minus />
									<Trans>Unstage file</Trans>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);

	return (
		<ContextMenu>
			<Tooltip delayDuration={500}>
				<ContextMenuTrigger asChild>
					<TooltipTrigger asChild>{rowButton}</TooltipTrigger>
				</ContextMenuTrigger>
				<TooltipContent side="right">{policy.hint}</TooltipContent>
			</Tooltip>
			<ContextMenuContent className="w-64">
				<ContextMenuItem
					onSelect={() => onSelect?.(file.path, false, changeKey)}
				>
					<GitCompare />
					<Trans>Open Diff</Trans>
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onSelect?.(file.path, true, changeKey)}
				>
					<SquarePlus />
					<Trans>Open Diff in New Tab</Trans>
					{diffNewTabTier && (
						<ContextMenuShortcut>
							{modifierLabel(diffNewTabTier)}
						</ContextMenuShortcut>
					)}
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => absolutePath && onOpenFile?.(absolutePath)}
					disabled={!onOpenFile || !absolutePath}
				>
					<FileText />
					<Trans>Open File</Trans>
					{fileTier && (
						<ContextMenuShortcut>{modifierLabel(fileTier)}</ContextMenuShortcut>
					)}
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => absolutePath && onOpenFile?.(absolutePath, true)}
					disabled={!onOpenFile || !absolutePath}
				>
					<SquarePlus />
					<Trans>Open File in New Tab</Trans>
				</ContextMenuItem>
				<ContextMenuItem
					onSelect={() => onOpenInEditor?.(file.path)}
					disabled={!onOpenInEditor}
				>
					<ExternalLink />
					<Trans>Open in Editor</Trans>
					{externalTier && (
						<ContextMenuShortcut>
							{modifierLabel(externalTier)}
						</ContextMenuShortcut>
					)}
				</ContextMenuItem>
				{absolutePath && (
					<>
						<ContextMenuSeparator />
						<PathActionsMenuItems
							absolutePath={absolutePath}
							relativePath={file.path}
						/>
					</>
				)}
				{(canStage || canUnstage) && <ContextMenuSeparator />}
				{canStage && (
					<ContextMenuItem onSelect={() => stageFile(file)}>
						<Plus />
						<Trans>Stage file</Trans>
					</ContextMenuItem>
				)}
				{canUnstage && (
					<ContextMenuItem onSelect={() => unstageFile(file)}>
						<Minus />
						<Trans>Unstage file</Trans>
					</ContextMenuItem>
				)}
				{canDiscard && (
					<ContextMenuItem
						variant="destructive"
						onSelect={() => setShowDiscardConfirm(true)}
					>
						{isDeleteAction ? <Trash2 /> : <Undo2 />}
						{isDeleteAction
							? t({ message: "Delete" })
							: t({
									message: "Discard changes",
								})}
					</ContextMenuItem>
				)}
			</ContextMenuContent>
			<DiscardConfirmDialog
				open={showDiscardConfirm}
				onOpenChange={setShowDiscardConfirm}
				title={
					isDeleteAction
						? t({
								message: `Delete "${basename}"?`,
							})
						: t({
								message: `Discard changes to "${basename}"?`,
							})
				}
				description={
					isDeleteAction
						? t({
								message:
									"This will permanently delete this file. This action cannot be undone.",
							})
						: t({
								message:
									"This will revert all changes to this file. This action cannot be undone.",
							})
				}
				confirmLabel={
					isDeleteAction
						? t({
								message: "Delete",
							})
						: t({
								message: "Discard",
							})
				}
				onConfirm={confirmDiscard}
			/>
		</ContextMenu>
	);
});

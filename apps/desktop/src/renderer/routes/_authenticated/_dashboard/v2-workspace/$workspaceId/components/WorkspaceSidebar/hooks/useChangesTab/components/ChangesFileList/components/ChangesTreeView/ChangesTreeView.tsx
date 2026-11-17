import { Trans, useLingui } from "@lingui/react/macro";
import type {
	ContextMenuItem as PierreContextMenuItem,
	ContextMenuOpenContext as PierreContextMenuOpenContext,
} from "@pierre/trees";
import {
	FileTree as PierreFileTree,
	useFileTreeSelector,
} from "@pierre/trees/react";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { Undo2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
	ShadowClickHint,
	useChangesSidebarFilePolicy,
	usePierreChangesSidebarRowClickPolicy,
} from "renderer/lib/clickPolicy";
import {
	createPierreTreeStyle,
	stripTrailingSlash,
} from "renderer/lib/pierreTree";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import { useChangedFilesTree } from "renderer/routes/_authenticated/_dashboard/hooks/useChangedFilesTree";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import { PierreRowContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/PierreRowContextMenu";
import { setFileDragData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/utils/setFileDragData";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import {
	toAbsoluteWorkspacePath,
	toRelativeWorkspacePath,
} from "shared/absolute-paths";
import { useStagingMutations } from "../../hooks/useStagingMutations";
import { StageToggleButton } from "../StageToggleButton";
import { FileRowContextMenuItems } from "./components/FileRowContextMenuItems";
import { FolderContextMenuItems } from "./components/FolderContextMenuItems";
import {
	HOVER_ACTIONS_ROW_CSS,
	ShadowRowHoverActions,
} from "./components/ShadowRowHoverActions";

// Small cushion so the last row never clips against the host's `overflow: hidden`.
const HEIGHT_CUSHION = 8;

const TREE_STYLE = createPierreTreeStyle({
	levelIndent: 8,
});

type SectionKind = ChangesetFile["source"]["kind"];

interface ChangesTreeViewProps {
	/** Files for a single section — caller has already pre-grouped by `source.kind`. */
	files: ChangesetFile[];
	/** Section the files came from; used to scope context-menu/hover Discard. */
	sectionKind: SectionKind;
	workspaceId: string;
	worktreePath?: string;
	/** Absolute path of the file whose diff is currently open, if any. */
	selectedFilePath?: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	selectedChangeKey?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (path: string) => void;
}

/**
 * Tree view of a single changes section, powered by `@pierre/trees`. Pierre
 * builds the directory hierarchy from the flat path list and handles
 * virtualization + status tints + icons; we layer on:
 *
 *  - `renderRowDecoration`: `+N/−N` on files, file count on directories
 *  - `renderContextMenu`: file-row actions matching `FileRow`; folder-row
 *    actions (open in editor, copy path)
 *  - hover actions overlay (Discard + Stage on unstaged, Unstage on staged,
 *    plus the more-actions ⌄ dropdown)
 *  - `useChangesSidebarFilePolicy` for settings-driven click routing
 *  - selection echo: when the diff pane's file is in this section, focus it
 *
 * The discard confirm dialog lives here, not in the per-row menus: Pierre
 * tears down `renderContextMenu` output when the menu closes, which would
 * unmount a dialog rendered inside it before the user could confirm.
 */
export const ChangesTreeView = memo(function ChangesTreeView({
	files,
	sectionKind,
	workspaceId,
	worktreePath,
	selectedFilePath,
	selectedChangeKey,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesTreeViewProps) {
	const { t } = useLingui();
	// Set when the user picks a row, so the echo below skips refocusing it.
	const lastUserSelectRef = useRef<string | null>(null);
	const { model, fileByTreePath, toTreePath, toRealPath } = useChangedFilesTree(
		{
			files,
			foldSignal,
			unsafeCSS: HOVER_ACTIONS_ROW_CSS,
			onSelectFile: (file) => {
				lastUserSelectRef.current = file.path;
				onSelectFile?.(file.path, false, getChangesetFileKey(file));
			},
		},
	);

	// Pierre's host renders `height: 100%`, which collapses to 0 inside this
	// section's auto-height container, so size it to the visible rows.
	const treeHeight =
		useFileTreeSelector(model, (tree) => tree.getVisibleCount()) *
			model.getItemHeight() +
		HEIGHT_CUSHION;

	// Echo the diff pane's open file back into the tree's selection — but only
	// when it belongs to this section. `lastUserSelectRef` guards the loop:
	// after the user clicks a row, the parent's selectedFilePath comes back to
	// us and we must not re-focus (which would re-fire onSelectionChange).
	const selectedRelPath =
		selectedFilePath && worktreePath
			? toRelativeWorkspacePath(worktreePath, selectedFilePath)
			: selectedFilePath;
	useEffect(() => {
		if (!selectedRelPath) return;
		const selectedTreePath = toTreePath.get(selectedRelPath) ?? selectedRelPath;
		const file = fileByTreePath.get(selectedTreePath);
		if (!file) return;
		// The same path can sit in several sections (staged + unstaged); only
		// the section holding the selected change echoes the focus, or every
		// section's copy would light up. A section that previously held the
		// focus keeps Pierre's row highlight until something else in it is
		// focused — the FileTree model exposes focusPath but no deselect, so
		// the stale highlight can't be cleared without remounting the tree.
		if (
			selectedChangeKey != null &&
			getChangesetFileKey(file) !== selectedChangeKey
		) {
			return;
		}
		if (lastUserSelectRef.current === selectedRelPath) {
			lastUserSelectRef.current = null;
			return;
		}
		model.focusPath(selectedTreePath);
	}, [model, selectedRelPath, selectedChangeKey, fileByTreePath, toTreePath]);

	const filePolicy = useChangesSidebarFilePolicy();
	const { onClickCapture, findFileRow } = usePierreChangesSidebarRowClickPolicy(
		{
			getFileIntent: filePolicy.getIntent,
			onSelectDiff: (rel, openInNewTab) => {
				const realPath = toRealPath.get(rel) ?? rel;
				lastUserSelectRef.current = realPath;
				const file = fileByTreePath.get(rel);
				onSelectFile?.(
					realPath,
					openInNewTab,
					file ? getChangesetFileKey(file) : undefined,
				);
			},
			onOpenFile: (rel, openInNewTab) => {
				if (!worktreePath) return;
				const realPath = toRealPath.get(rel) ?? rel;
				onOpenFile?.(
					toAbsoluteWorkspacePath(worktreePath, realPath),
					openInNewTab,
				);
			},
			openInExternalEditor: (rel) =>
				onOpenInEditor?.(toRealPath.get(rel) ?? rel),
		},
	);

	// Native file drag (drop a row on a terminal to paste its path). Pierre
	// owns the row DOM and renders rows `draggable="false"`, so the drag
	// source is this wrapper instead; Chromium still starts the drag from the
	// nearest draggable ancestor. `dragstart` targets that source, not the
	// row, so the row is captured on pointerdown and cancelled for non-files.
	const dragRowRef = useRef<HTMLElement | null>(null);
	const onPointerDownCapture = useCallback(
		(e: React.PointerEvent) => {
			dragRowRef.current = findFileRow(e);
		},
		[findFileRow],
	);
	const onDragStart = useCallback(
		(e: React.DragEvent) => {
			const row = dragRowRef.current;
			const treePath = row?.getAttribute("data-item-path");
			if (!row || !treePath || !worktreePath) {
				e.preventDefault();
				return;
			}
			const realPath = toRealPath.get(treePath) ?? treePath;
			setFileDragData(
				e.dataTransfer,
				toAbsoluteWorkspacePath(worktreePath, realPath),
			);
			const rect = row.getBoundingClientRect();
			e.dataTransfer.setDragImage(
				row,
				e.clientX - rect.left,
				e.clientY - rect.top,
			);
		},
		[worktreePath, toRealPath],
	);

	// Hoisted so the dialog outlives the menu/hover overlay that triggers it.
	const [discardTarget, setDiscardTarget] = useState<ChangesetFile | null>(
		null,
	);
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

	const { stageFile, unstageFile } = useStagingMutations(workspaceId);

	const fileMenuItems = (file: ChangesetFile) => (
		<FileRowContextMenuItems
			file={file}
			worktreePath={worktreePath}
			sectionKind={sectionKind}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={onOpenInEditor}
			onRequestDiscard={setDiscardTarget}
			onStageFile={stageFile}
			onUnstageFile={unstageFile}
		/>
	);

	const renderContextMenu = (
		item: PierreContextMenuItem,
		ctx: PierreContextMenuOpenContext,
	) => {
		const menuItems = (() => {
			if (item.kind === "directory") {
				return (
					<FolderContextMenuItems
						relativePath={stripTrailingSlash(item.path)}
						worktreePath={worktreePath}
						onOpenInEditor={onOpenInEditor}
					/>
				);
			}
			const file = fileByTreePath.get(item.path);
			return file ? fileMenuItems(file) : null;
		})();
		if (!menuItems) return null;
		return (
			<PierreRowContextMenu
				anchorRect={ctx.anchorRect}
				onClose={ctx.close}
				data-file-tree-context-menu-root="true"
			>
				{menuItems}
			</PierreRowContextMenu>
		);
	};

	const renderHoverInlineActions = (treePath: string) => {
		const file = fileByTreePath.get(treePath);
		if (!file) return null;
		if (sectionKind === "staged") {
			return (
				<StageToggleButton action="unstage" onClick={() => unstageFile(file)} />
			);
		}
		if (sectionKind !== "unstaged") return null;
		return (
			<>
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
								setDiscardTarget(file);
							}}
						>
							<Undo2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">
						<Trans>Discard changes</Trans>
					</TooltipContent>
				</Tooltip>
				<StageToggleButton action="stage" onClick={() => stageFile(file)} />
			</>
		);
	};

	const renderHoverMenuContent = (treePath: string) => {
		const file = fileByTreePath.get(treePath);
		return file ? fileMenuItems(file) : null;
	};

	const discardIsDelete =
		discardTarget?.status === "untracked" || discardTarget?.status === "added";
	const discardBasename = discardTarget
		? (discardTarget.path.split("/").pop() ?? discardTarget.path)
		: "";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag source for rows Pierre renders inside a shadow root
		<div
			draggable
			onClickCapture={onClickCapture}
			onPointerDownCapture={onPointerDownCapture}
			onDragStart={onDragStart}
		>
			<ShadowClickHint hint={filePolicy.hint} findRow={findFileRow}>
				<ShadowRowHoverActions
					findFileRow={findFileRow}
					renderInlineActions={renderHoverInlineActions}
					renderMenuContent={renderHoverMenuContent}
				>
					<PierreFileTree
						model={model}
						style={{ ...TREE_STYLE, height: treeHeight }}
						renderContextMenu={renderContextMenu}
					/>
				</ShadowRowHoverActions>
			</ShadowClickHint>
			{discardTarget && (
				<DiscardConfirmDialog
					open
					onOpenChange={(open) => !open && setDiscardTarget(null)}
					title={
						discardIsDelete
							? t({
									message: `Delete "${discardBasename}"?`,
								})
							: t({
									message: `Discard changes to "${discardBasename}"?`,
								})
					}
					description={
						discardIsDelete
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
						discardIsDelete
							? t({
									message: "Delete",
								})
							: t({
									message: "Discard",
								})
					}
					onConfirm={() => {
						const target = discardTarget;
						setDiscardTarget(null);
						discardMutation.mutate({
							workspaceId,
							filePath: target.path,
						});
					}}
				/>
			)}
		</div>
	);
});

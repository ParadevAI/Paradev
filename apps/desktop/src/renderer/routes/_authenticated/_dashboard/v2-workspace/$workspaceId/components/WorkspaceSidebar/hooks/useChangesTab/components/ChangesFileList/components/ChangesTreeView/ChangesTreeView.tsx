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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ShadowClickHint,
	useChangesSidebarFilePolicy,
	usePierreChangesSidebarRowClickPolicy,
} from "renderer/lib/clickPolicy";
import {
	createPierreTreeStyle,
	diffStatsDecoration,
	stripTrailingSlash,
} from "renderer/lib/pierreTree";
import { DiscardConfirmDialog } from "renderer/routes/_authenticated/_dashboard/components/DiscardConfirmDialog";
import type { FileStatus } from "renderer/routes/_authenticated/_dashboard/components/StatusIndicator";
import { useChangedFilesTree } from "renderer/routes/_authenticated/_dashboard/hooks/useChangedFilesTree";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";
import { PierreRowContextMenu } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/PierreRowContextMenu";
import { setFileDragData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/utils/setFileDragData";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { checkoutInput } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/checkoutInput";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { SelectDiffFile } from "../../../../hooks/useChangesContent";
import { useStagingMutations } from "../../hooks/useStagingMutations";
import {
	changesTreePath,
	fileCheckout,
	groupFilesByRepository,
	type RepositoryRoot,
} from "../../utils/repositoryTree";
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

interface TreeEntry {
	path: string;
	status: FileStatus;
	additions: number | null;
	deletions: number | null;
	file: ChangesetFile;
}

interface ChangesTreeViewProps {
	/** Files for a single section — caller has already pre-grouped by `source.kind`. */
	files: ChangesetFile[];
	/** Section the files came from; used to scope context-menu/hover Discard. */
	sectionKind: SectionKind;
	workspaceId: string;
	repositoryId: string | undefined;
	/** The folder the tree's paths start from. */
	worktreePath?: string;
	/** Set when the tree shows several checkouts, each as a top-level folder. */
	repositories?: RepositoryRoot[];
	/** Absolute path of the file whose diff is currently open, if any. */
	selectedFilePath?: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	selectedChangeKey?: string;
	/** Bumped by the toolbar's expand-all / collapse-all buttons. */
	foldSignal: FoldSignal;
	onSelectFile?: SelectDiffFile;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
	onOpenInEditor?: (absolutePath: string) => void;
}

/**
 * Tree view of a single changes section, powered by `@pierre/trees`. Pierre
 * builds the directory hierarchy from the flat path list and handles
 * virtualization + status tints + icons; we layer on:
 *
 *  - `renderRowDecoration`: `+N/−N` on files and repository folders, file
 *    count on other directories
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
	repositoryId,
	worktreePath,
	repositories,
	selectedFilePath,
	selectedChangeKey,
	foldSignal,
	onSelectFile,
	onOpenFile,
	onOpenInEditor,
}: ChangesTreeViewProps) {
	const { t } = useLingui();
	const checkoutOf = useCallback(
		(file: ChangesetFile) =>
			fileCheckout(file, { repositoryId, worktreePath }, repositories),
		[repositoryId, worktreePath, repositories],
	);
	const absolutePathOf = useCallback(
		(file: ChangesetFile) => {
			const checkout = checkoutOf(file).worktreePath;
			return checkout
				? toAbsoluteWorkspacePath(checkout, file.path)
				: undefined;
		},
		[checkoutOf],
	);
	const selectFile = useCallback(
		(file: ChangesetFile, openInNewTab: boolean) =>
			onSelectFile?.(
				file.path,
				openInNewTab,
				getChangesetFileKey(file),
				checkoutOf(file).repositoryId,
			),
		[onSelectFile, checkoutOf],
	);

	const entries = useMemo<TreeEntry[]>(
		() =>
			files.map((file) => ({
				path: changesTreePath(file, repositories),
				status: file.status,
				additions: file.additions,
				deletions: file.deletions,
				file,
			})),
		[files, repositories],
	);
	const repositoryTotals = useMemo(
		() =>
			new Map(
				groupFilesByRepository(files, repositories ?? []).map(
					({ repository, additions, deletions }) => [
						repository.name,
						diffStatsDecoration(additions, deletions),
					],
				),
			),
		[files, repositories],
	);

	// Set when the user picks a row, so the echo below skips refocusing it.
	const lastUserSelectRef = useRef<string | null>(null);
	const { model, fileByTreePath } = useChangedFilesTree<TreeEntry>({
		files: entries,
		foldSignal,
		// Pierre can only flatten every folder chain or none, and a flattened
		// repository folder would merge into the folder below it.
		flattenEmptyDirectories: repositories ? false : undefined,
		unsafeCSS: HOVER_ACTIONS_ROW_CSS,
		onSelectFile: (entry) => {
			lastUserSelectRef.current = absolutePathOf(entry.file) ?? null;
			selectFile(entry.file, false);
		},
		directoryDecoration: (directoryPath) => repositoryTotals.get(directoryPath),
	});
	const fileAt = useCallback(
		(treePath: string) => fileByTreePath.get(treePath)?.file,
		[fileByTreePath],
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
	const treePathByAbsolutePath = useMemo(() => {
		const map = new Map<string, string>();
		for (const [treePath, entry] of fileByTreePath) {
			const absolutePath = absolutePathOf(entry.file);
			if (absolutePath) map.set(absolutePath, treePath);
		}
		return map;
	}, [fileByTreePath, absolutePathOf]);
	useEffect(() => {
		if (!selectedFilePath) return;
		const selectedTreePath = treePathByAbsolutePath.get(selectedFilePath);
		const file = selectedTreePath ? fileAt(selectedTreePath) : undefined;
		if (!selectedTreePath || !file) return;
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
		if (lastUserSelectRef.current === selectedFilePath) {
			lastUserSelectRef.current = null;
			return;
		}
		model.focusPath(selectedTreePath);
	}, [
		model,
		selectedFilePath,
		selectedChangeKey,
		treePathByAbsolutePath,
		fileAt,
	]);

	const filePolicy = useChangesSidebarFilePolicy();
	const { onClickCapture, findFileRow } = usePierreChangesSidebarRowClickPolicy(
		{
			getFileIntent: filePolicy.getIntent,
			onSelectDiff: (treePath, openInNewTab) => {
				const file = fileAt(treePath);
				if (!file) return;
				lastUserSelectRef.current = absolutePathOf(file) ?? null;
				selectFile(file, openInNewTab === true);
			},
			onOpenFile: (treePath, openInNewTab) => {
				const file = fileAt(treePath);
				const absolutePath = file && absolutePathOf(file);
				if (absolutePath) onOpenFile?.(absolutePath, openInNewTab);
			},
			openInExternalEditor: (treePath) => {
				const file = fileAt(treePath);
				const absolutePath = file && absolutePathOf(file);
				if (absolutePath) onOpenInEditor?.(absolutePath);
			},
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
			const file = treePath ? fileAt(treePath) : undefined;
			const absolutePath = file && absolutePathOf(file);
			if (!row || !absolutePath) {
				e.preventDefault();
				return;
			}
			setFileDragData(e.dataTransfer, absolutePath);
			const rect = row.getBoundingClientRect();
			e.dataTransfer.setDragImage(
				row,
				e.clientX - rect.left,
				e.clientY - rect.top,
			);
		},
		[fileAt, absolutePathOf],
	);

	// Hoisted so the dialog outlives the menu/hover overlay that triggers it.
	const [discardTarget, setDiscardTarget] = useState<ChangesetFile | null>(
		null,
	);
	const utils = workspaceTrpc.useUtils();
	const discardMutation = workspaceTrpc.git.discardChanges.useMutation({
		onSuccess: (_data, variables) => {
			const scope = checkoutInput(
				variables.workspaceId,
				variables.repositoryId,
			);
			void utils.git.getStatus.invalidate(scope);
			void utils.git.getDiff.invalidate(scope);
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

	const { stageFile, unstageFile } = useStagingMutations(
		workspaceId,
		repositoryId,
	);

	const fileMenuItems = (file: ChangesetFile) => (
		<FileRowContextMenuItems
			file={file}
			worktreePath={checkoutOf(file).worktreePath}
			sectionKind={sectionKind}
			onSelectFile={(_path, openInNewTab) =>
				selectFile(file, openInNewTab === true)
			}
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
			const file = fileAt(item.path);
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
		const file = fileAt(treePath);
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
		const file = fileAt(treePath);
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
							...checkoutInput(workspaceId, checkoutOf(target).repositoryId),
							filePath: target.path,
						});
					}}
				/>
			)}
		</div>
	);
});

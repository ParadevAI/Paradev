import type {
	FileTreeDirectoryHandle,
	FileTreeRowDecoration,
	FileTreeRowDecorationContext,
} from "@pierre/trees";
import { useFileTree } from "@pierre/trees/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFallthroughIcons } from "renderer/lib/fileIcons";
import {
	buildCollisionSafeTreePaths,
	diffStatsDecoration,
	FILE_STATUS_TO_PIERRE,
	type FileStatus,
	PIERRE_TREE_UNSAFE_CSS,
	type PierreGitStatusEntry,
	stripTrailingSlash,
} from "renderer/lib/pierreTree";
import { type FoldSignal, isFoldCollapsed } from "../useFoldSignal";
import { buildTreeShape } from "./utils/buildTreeShape";
import { expandedDirs, recordExpansion } from "./utils/carryExpansion";

const ITEM_HEIGHT = 24;

export interface ChangedFileEntry {
	path: string;
	status: FileStatus;
	additions: number | null;
	deletions: number | null;
}

interface UseChangedFilesTreeParams<T extends ChangedFileEntry> {
	files: T[];
	foldSignal: FoldSignal;
	onSelectFile: (file: T) => void;
	initialSelectedPath?: string;
	flattenEmptyDirectories?: boolean;
	unsafeCSS?: string;
}

/**
 * A `@pierre/trees` model for a changed-file list: status tints, `+N −M` on
 * files, file counts on directories, fallthrough icons, and fold signals.
 * Pierre throws on a path that is both a file and a directory, so colliding
 * files get disambiguated tree paths; `toRealPath` maps them back.
 *
 * Pierre's `resetPaths` rebuilds the tree from its creation options, so each
 * folder's expansion is carried across resets here; a folder not seen before
 * follows the last fold action.
 */
export function useChangedFilesTree<T extends ChangedFileEntry>({
	files,
	foldSignal,
	onSelectFile,
	initialSelectedPath,
	flattenEmptyDirectories,
	unsafeCSS = "",
}: UseChangedFilesTreeParams<T>) {
	const { treePaths, toTreePath, toRealPath } = useMemo(
		() => buildCollisionSafeTreePaths(files.map((f) => f.path)),
		[files],
	);
	const fileByTreePath = useMemo(() => {
		const map = new Map<string, T>();
		for (const file of files)
			map.set(toTreePath.get(file.path) ?? file.path, file);
		return map;
	}, [files, toTreePath]);
	const { dirs, dirFileCount, chainDirs } = useMemo(
		() => buildTreeShape(treePaths),
		[treePaths],
	);

	const expansionRef = useRef({
		known: new Map<string, boolean>(),
		defaultOpen: !isFoldCollapsed(foldSignal),
	});
	const [initial] = useState(() => {
		const selected =
			initialSelectedPath == null
				? undefined
				: (toTreePath.get(initialSelectedPath) ?? initialSelectedPath);
		return {
			gitStatus: buildGitStatus(files, toTreePath),
			expandedPaths: expansionRef.current.defaultOpen ? dirs : [],
			selectedPaths:
				selected && fileByTreePath.has(selected) ? [selected] : undefined,
		};
	});

	// Pierre resolves its handlers once at creation; the ref keeps them current.
	const handlersRef = useRef({
		onSelect(_treePath: string) {},
		renderRowDecoration(
			_ctx: FileTreeRowDecorationContext,
		): FileTreeRowDecoration | null {
			return null;
		},
	});

	const { model } = useFileTree({
		paths: treePaths,
		initialExpansion: "closed",
		initialExpandedPaths: initial.expandedPaths,
		initialSelectedPaths: initial.selectedPaths,
		flattenEmptyDirectories,
		search: false,
		unsafeCSS: PIERRE_TREE_UNSAFE_CSS + unsafeCSS,
		gitStatus: initial.gitStatus,
		icons: { set: "complete", colored: true },
		itemHeight: ITEM_HEIGHT,
		overscan: 20,
		stickyFolders: true,
		onSelectionChange: (selected) => {
			const last = selected[selected.length - 1];
			if (!last || last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
		renderRowDecoration: (ctx) => handlersRef.current.renderRowDecoration(ctx),
	});

	const isDirExpanded = useCallback(
		(dir: string) => {
			const handle = model.getItem(`${dir}/`);
			return handle?.isDirectory() === true
				? (handle as FileTreeDirectoryHandle).isExpanded()
				: undefined;
		},
		[model],
	);

	const shapeRef = useRef({ treePaths, dirs, chainDirs });
	useEffect(() => {
		const previous = shapeRef.current;
		if (previous.treePaths === treePaths) return;
		const { known, defaultOpen } = expansionRef.current;
		const flattened = flattenEmptyDirectories === true;
		recordExpansion(previous, isDirExpanded, known, flattened);
		model.resetPaths(treePaths, {
			initialExpandedPaths: expandedDirs(
				{ dirs, chainDirs },
				known,
				defaultOpen,
				flattened,
			),
		});
		shapeRef.current = { treePaths, dirs, chainDirs };
	}, [
		model,
		treePaths,
		dirs,
		chainDirs,
		isDirExpanded,
		flattenEmptyDirectories,
	]);

	useEffect(() => {
		model.setGitStatus(buildGitStatus(files, toTreePath));
	}, [model, files, toTreePath]);

	useFallthroughIcons(model);

	const lastFoldEpochRef = useRef(foldSignal.epoch);
	useEffect(() => {
		if (foldSignal.epoch === lastFoldEpochRef.current) return;
		lastFoldEpochRef.current = foldSignal.epoch;
		const expand = foldSignal.action === "expand";
		expansionRef.current = { known: new Map(), defaultOpen: expand };
		for (const dir of dirs) {
			const expanded = isDirExpanded(dir);
			if (expanded === undefined || expanded === expand) continue;
			const handle = model.getItem(`${dir}/`) as FileTreeDirectoryHandle;
			if (expand) handle.expand();
			else handle.collapse();
		}
	}, [foldSignal, dirs, model, isDirExpanded]);

	handlersRef.current.onSelect = (treePath) => {
		const file = fileByTreePath.get(treePath);
		if (file) onSelectFile(file);
	};
	// Pierre decorations take text or an icon, not JSX; the status itself is
	// painted by setGitStatus.
	handlersRef.current.renderRowDecoration = (ctx) => {
		if (ctx.item.kind === "directory") {
			const count = dirFileCount.get(stripTrailingSlash(ctx.item.path));
			return count ? { text: String(count) } : null;
		}
		const file = fileByTreePath.get(ctx.item.path);
		if (!file) return null;
		return diffStatsDecoration(file.additions, file.deletions);
	};

	return { model, fileByTreePath, toTreePath, toRealPath };
}

function buildGitStatus(
	files: ChangedFileEntry[],
	toTreePath: Map<string, string>,
): PierreGitStatusEntry[] {
	return files.map((file) => ({
		path: toTreePath.get(file.path) ?? file.path,
		status: FILE_STATUS_TO_PIERRE[file.status],
	}));
}

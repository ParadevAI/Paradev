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
import type { FoldSignal } from "../useFoldSignal";
import { buildTreeShape } from "./utils/buildTreeShape";

const ITEM_HEIGHT = 24;

export interface ChangedFileEntry {
	path: string;
	status: FileStatus;
	additions: number | null;
	deletions: number | null;
}

interface UseChangedFilesTreeParams<T extends ChangedFileEntry> {
	files: T[];
	/** Bumped by an expand-all / collapse-all control. */
	foldSignal: FoldSignal;
	onSelectFile: (file: T) => void;
	initialExpansion?: "open" | "closed";
	flattenEmptyDirectories?: boolean;
	/** Appended to the shared tree CSS. */
	unsafeCSS?: string;
}

/**
 * A `@pierre/trees` model for a changed-file list: status tints, `+N −M` on
 * files, file counts on directories, fallthrough icons, and fold signals.
 * Pierre throws on a path that is both a file and a directory, so colliding
 * files get disambiguated tree paths; `toRealPath` maps them back.
 */
export function useChangedFilesTree<T extends ChangedFileEntry>({
	files,
	foldSignal,
	onSelectFile,
	initialExpansion = "open",
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
	const { dirs, dirFileCount } = useMemo(
		() => buildTreeShape(treePaths),
		[treePaths],
	);
	const [initialGitStatus] = useState(() => buildGitStatus(files, toTreePath));

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
		initialExpansion,
		flattenEmptyDirectories,
		search: false,
		unsafeCSS: PIERRE_TREE_UNSAFE_CSS + unsafeCSS,
		gitStatus: initialGitStatus,
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

	useEffect(() => {
		model.resetPaths(treePaths);
	}, [model, treePaths]);

	useEffect(() => {
		model.setGitStatus(buildGitStatus(files, toTreePath));
	}, [model, files, toTreePath]);

	useFallthroughIcons(model);

	const setAllDirsExpanded = useCallback(
		(expanded: boolean) => {
			for (const dir of dirs) {
				const handle = model.getItem(`${dir}/`);
				if (handle?.isDirectory() !== true) continue;
				const dirHandle = handle as FileTreeDirectoryHandle;
				if (dirHandle.isExpanded() === expanded) continue;
				if (expanded) dirHandle.expand();
				else dirHandle.collapse();
			}
		},
		[model, dirs],
	);

	const lastFoldEpochRef = useRef(0);
	useEffect(() => {
		if (foldSignal.epoch === 0 || foldSignal.epoch === lastFoldEpochRef.current)
			return;
		lastFoldEpochRef.current = foldSignal.epoch;
		setAllDirsExpanded(foldSignal.action === "expand");
	}, [foldSignal, setAllDirsExpanded]);

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

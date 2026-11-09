import { FileTree as PierreFileTree } from "@pierre/trees/react";
import { createPierreTreeStyle } from "renderer/lib/pierreTree";
import {
	type ChangedFileEntry,
	useChangedFilesTree,
} from "renderer/routes/_authenticated/_dashboard/hooks/useChangedFilesTree";
import type { FoldSignal } from "renderer/routes/_authenticated/_dashboard/hooks/useFoldSignal";

const TREE_STYLE = createPierreTreeStyle({
	levelIndent: 8,
});

interface PullRequestFileTreeProps {
	files: ChangedFileEntry[];
	foldSignal: FoldSignal;
	initialExpansion: "open" | "closed";
	onSelectFile: (path: string) => void;
}

export function PullRequestFileTree({
	files,
	foldSignal,
	initialExpansion,
	onSelectFile,
}: PullRequestFileTreeProps) {
	const { model } = useChangedFilesTree({
		files,
		foldSignal,
		initialExpansion,
		// PR diffs nest deep; one row per single-child folder chain keeps names readable.
		flattenEmptyDirectories: true,
		onSelectFile: (file) => onSelectFile(file.path),
	});
	return (
		<PierreFileTree model={model} style={{ ...TREE_STYLE, height: "100%" }} />
	);
}

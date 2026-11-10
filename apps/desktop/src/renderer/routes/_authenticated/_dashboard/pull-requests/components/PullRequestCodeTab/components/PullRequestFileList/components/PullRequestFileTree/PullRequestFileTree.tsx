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
	selectedPath: string | null;
	onSelectFile: (path: string) => void;
}

export function PullRequestFileTree({
	files,
	foldSignal,
	selectedPath,
	onSelectFile,
}: PullRequestFileTreeProps) {
	const { model, fileByTreePath } = useChangedFilesTree({
		files,
		foldSignal,
		selectedPath,
		flattenEmptyDirectories: true,
		onSelectFile: (file) => onSelectFile(file.path),
	});

	// Pierre ignores a click on the row that is already selected, which would
	// drop "click again to jump back to this file".
	const onClickCapture = (e: React.MouseEvent) => {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
			return;
		const row = e.nativeEvent
			.composedPath()
			.find(
				(node): node is HTMLElement =>
					node instanceof HTMLElement && node.hasAttribute("data-item-path"),
			);
		const treePath = row?.getAttribute("data-item-path");
		const selected = model.getSelectedPaths();
		if (!treePath || selected.length !== 1 || selected[0] !== treePath) return;
		const file = fileByTreePath.get(treePath);
		if (file) onSelectFile(file.path);
	};

	return (
		<div className="h-full" onClickCapture={onClickCapture}>
			<PierreFileTree model={model} style={{ ...TREE_STYLE, height: "100%" }} />
		</div>
	);
}

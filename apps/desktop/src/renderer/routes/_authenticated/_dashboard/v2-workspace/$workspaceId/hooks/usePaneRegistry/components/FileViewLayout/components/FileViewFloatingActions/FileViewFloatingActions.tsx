import { FileOpenInButton } from "../../../FileOpenInButton";
import { FileSaveButton } from "./components/FileSaveButton";
import { FileTreeToggle } from "./components/FileTreeToggle";

interface FileViewFloatingActionsProps {
	workspaceId: string;
	filePath: string;
	treeToggle?: { visible: boolean; onToggle: () => void };
}

/** Open in and the tree toggle, in one spot whether the tree shows or not. */
export function FileViewFloatingActions({
	workspaceId,
	filePath,
	treeToggle,
}: FileViewFloatingActionsProps) {
	return (
		<div
			data-file-view-actions
			className="absolute top-2 right-2 z-10 flex h-8 items-center gap-1"
		>
			<FileSaveButton workspaceId={workspaceId} filePath={filePath} />
			<FileOpenInButton workspaceId={workspaceId} filePath={filePath} />
			<FileTreeToggle {...treeToggle} />
		</div>
	);
}

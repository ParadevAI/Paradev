import { DirectoryRows } from "./components/DirectoryRows";

interface BreadcrumbTreeProps {
	workspaceId: string;
	directory: string;
	expandedPaths: readonly string[];
	currentFilePath: string;
	onOpenFile: (absolutePath: string) => void;
}

export function BreadcrumbTree({
	workspaceId,
	directory,
	expandedPaths,
	currentFilePath,
	onOpenFile,
}: BreadcrumbTreeProps) {
	return (
		<div className="max-h-80 w-64 overflow-y-auto p-1">
			<DirectoryRows
				workspaceId={workspaceId}
				directory={directory}
				depth={0}
				initiallyExpanded={expandedPaths}
				currentFilePath={currentFilePath}
				onOpenFile={onOpenFile}
			/>
		</div>
	);
}

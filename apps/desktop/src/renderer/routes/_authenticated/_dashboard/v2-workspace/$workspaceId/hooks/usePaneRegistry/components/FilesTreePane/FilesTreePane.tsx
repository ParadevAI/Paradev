import type { RendererContext } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { FileViewTree } from "../FileViewTree";

interface FilesTreePaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	onSearch?: () => void;
}

export function FilesTreePane({
	context,
	workspaceId,
	onSearch,
}: FilesTreePaneProps) {
	return (
		<div className="h-full min-w-0">
			<FileViewTree
				context={context}
				workspaceId={workspaceId}
				onSearch={onSearch}
			/>
		</div>
	);
}

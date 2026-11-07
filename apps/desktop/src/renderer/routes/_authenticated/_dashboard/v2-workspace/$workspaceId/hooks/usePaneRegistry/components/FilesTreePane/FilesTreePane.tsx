import type { RendererContext } from "@superset/panes";
import type { PaneViewerData } from "../../../../types";
import { FileViewLayout } from "../FileViewLayout";

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
		<FileViewLayout
			context={context}
			workspaceId={workspaceId}
			showTree
			onSearch={onSearch}
		/>
	);
}

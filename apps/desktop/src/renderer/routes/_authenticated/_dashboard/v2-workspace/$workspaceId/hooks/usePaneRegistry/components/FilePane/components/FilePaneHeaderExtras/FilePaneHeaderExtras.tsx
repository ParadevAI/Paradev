import type { RendererContext } from "@superset/panes";
import { useCallback } from "react";
import { useSharedFileDocument } from "../../../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { orderForToggle, resolveActivePaneView } from "../../registry";
import { FileViewToggle } from "../FileViewToggle";

interface FilePaneHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePaneHeaderExtras({
	context,
	workspaceId,
}: FilePaneHeaderExtrasProps) {
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;

	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});

	const handleChangeView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	const { views, activeView } = resolveActivePaneView(document, data);
	const shouldShowToggle =
		views.length > 1 && !data.forceViewId && activeView !== null;

	return (
		<div className="flex min-w-0 items-center gap-1">
			{shouldShowToggle && activeView && (
				<FileViewToggle
					views={orderForToggle(views)}
					activeViewId={activeView.id}
					filePath={filePath}
					onChange={handleChangeView}
				/>
			)}
		</div>
	);
}

import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { Button } from "@superset/ui/button";
import { useCallback } from "react";
import { useSharedFileDocument } from "../../../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../../../types";
import { FileTreeToggle } from "../../../FileTreeToggle";
import { orderForToggle, resolveActivePaneView } from "../../registry";
import { FileViewToggle } from "../FileViewToggle";
import { FileOpenInButton } from "./components/FileOpenInButton";

interface FilePaneHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	showTreeToggle?: boolean;
}

export function FilePaneHeaderExtras({
	context,
	workspaceId,
	showTreeToggle = false,
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
			{document.content.kind === "text" &&
				(document.dirty || document.pendingSave) && (
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-xs"
						disabled={document.pendingSave}
						onClick={() => void document.save()}
					>
						{document.pendingSave ? (
							<Trans>Saving...</Trans>
						) : (
							<Trans>Save</Trans>
						)}
					</Button>
				)}
			{shouldShowToggle && activeView && (
				<FileViewToggle
					views={orderForToggle(views)}
					activeViewId={activeView.id}
					filePath={filePath}
					onChange={handleChangeView}
				/>
			)}
			<FileOpenInButton workspaceId={workspaceId} filePath={filePath} />
			{showTreeToggle && <FileTreeToggle />}
		</div>
	);
}

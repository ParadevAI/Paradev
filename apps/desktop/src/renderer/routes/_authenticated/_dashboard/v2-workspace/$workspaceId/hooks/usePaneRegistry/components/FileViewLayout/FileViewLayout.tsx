import type { RendererContext } from "@superset/panes";
import type { ReactNode } from "react";
import { useFileTreeVisibilityStore } from "../../../../state/fileTreeVisibilityStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { FileViewFloatingActions } from "./components/FileViewFloatingActions";
import { FileViewTree } from "./components/FileViewTree";

interface FileViewLayoutProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
	showTree: boolean;
	onSearch?: () => void;
	children?: ReactNode;
}

export function FileViewLayout({
	context,
	workspaceId,
	showTree,
	onSearch,
	children,
}: FileViewLayoutProps) {
	const visible = useFileTreeVisibilityStore((state) => state.visible);
	const tabHasTreePane =
		context.pane.kind !== "files" &&
		Object.values(context.tab.panes).some((pane) => pane.kind === "files");
	if (!showTree || tabHasTreePane) return children;
	return (
		<div className="flex h-full w-full min-w-0">
			<div className="relative h-full min-w-0 flex-1">
				{children}
				{!visible && (
					<FileViewFloatingActions
						workspaceId={workspaceId}
						filePath={
							context.pane.kind === "file"
								? (context.pane.data as FilePaneData).filePath
								: undefined
						}
						onSearch={onSearch}
					/>
				)}
			</div>
			{visible && (
				<div className="h-full w-64 shrink-0 border-l border-border/40">
					<FileViewTree
						context={context}
						workspaceId={workspaceId}
						onSearch={onSearch}
					/>
				</div>
			)}
		</div>
	);
}

import type { RendererContext } from "@superset/panes";
import { pendingLaunchSurface } from "renderer/stores/workspace-creates/pendingCloudLaunch";
import type {
	PaneViewerData,
	PendingCloudLaunchPaneData,
} from "../../../../types";
import { PendingCloudChat } from "./components/PendingCloudChat";
import { PendingCloudTerminal } from "./components/PendingCloudTerminal";
import { usePendingCloudLaunch } from "./hooks/usePendingCloudLaunch";

export function PendingCloudLaunchPane({
	ctx,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}) {
	const data = ctx.pane.data as PendingCloudLaunchPaneData;
	usePendingCloudLaunch({ ctx, workspaceId });
	const surface = pendingLaunchSurface(data);
	switch (surface) {
		case "chat":
			return <PendingCloudChat ctx={ctx} workspaceId={workspaceId} />;
		case "terminal":
			return <PendingCloudTerminal data={data} workspaceId={workspaceId} />;
		default:
			return surface satisfies never;
	}
}

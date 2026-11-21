import { useBoxPressure } from "renderer/stores/box-pressure";
import { DashboardSidebarWorkspaceHostGlyph } from "../DashboardSidebarWorkspaceHostGlyph";
import { useSandboxIsConnecting } from "./hooks/useSandboxIsConnecting";

export function DashboardSidebarOpenCloudHostGlyph({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const isConnecting = useSandboxIsConnecting(workspaceId);
	const pressure = useBoxPressure(workspaceId);
	return (
		<DashboardSidebarWorkspaceHostGlyph
			hostType="cloud"
			hostIsOnline={null}
			cloudState={isConnecting ? "connecting" : "on"}
			pressure={pressure?.level ?? null}
		/>
	);
}

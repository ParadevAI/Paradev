import type { ChatPaneData } from "../../../../../../types";
import type { SurfaceForkSource } from "../../../../hooks/useSurfaceFork";
import { useSurfaceForkSource } from "../../../../hooks/useSurfaceForkSource";
import { SurfaceModeMenu } from "../../../SurfaceModeMenu";

export function ChatModeMenu({
	data,
	onFork,
	workspaceId,
}: {
	data: ChatPaneData;
	onFork: (source: SurfaceForkSource) => void;
	workspaceId: string;
}) {
	const source = useSurfaceForkSource(workspaceId, { kind: "chat", data });
	if (!source) return null;
	return <SurfaceModeMenu mode="chat" source={source} onFork={onFork} />;
}

import type { ChatPaneData } from "../../../../../../types";
import type {
	SurfaceForkPlacement,
	SurfaceForkSource,
} from "../../../../hooks/useSurfaceFork";
import { useSurfaceForkSource } from "../../../../hooks/useSurfaceForkSource";
import { SurfaceModeMenu } from "../../../SurfaceModeMenu";

export function ChatModeMenu({
	data,
	onFork,
	workspaceId,
}: {
	data: ChatPaneData;
	onFork: (source: SurfaceForkSource, placement: SurfaceForkPlacement) => void;
	workspaceId: string;
}) {
	const { enabled, source } = useSurfaceForkSource(workspaceId, {
		kind: "chat",
		data,
	});
	if (!enabled || !source) return null;
	return <SurfaceModeMenu mode="chat" source={source} onFork={onFork} />;
}

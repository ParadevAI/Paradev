import type { WorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import type { ChatPreviewLoad } from "../../components/ChatPreviewCard";
import type { PreviewMessage } from "../previewMessages";

type PreviewQuery = {
	data: { title: string | null; messages: PreviewMessage[] } | null | undefined;
	isError: boolean;
};

/** A workspace no host knows can't be loaded, so it reads as unavailable. */
export function chatPreviewLoad(
	host: WorkspaceHostTarget,
	query: PreviewQuery,
): ChatPreviewLoad {
	if (query.data) return { status: "ready", ...query.data };
	if (host.status === "not-found" || query.isError || query.data === null) {
		return { status: "unavailable" };
	}
	return { status: "loading" };
}

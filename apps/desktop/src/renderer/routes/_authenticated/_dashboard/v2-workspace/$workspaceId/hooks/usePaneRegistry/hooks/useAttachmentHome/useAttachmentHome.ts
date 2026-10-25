import { useWorkspaceHostTarget } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import type { AttachmentHome } from "../../utils/sendAttachmentsToWorkspace";

/** Null until the workspace's host is known. */
export function useAttachmentHome(workspaceId: string): {
	home: AttachmentHome | null;
	hostKind: "local" | "remote" | "sandbox" | null;
	hostUrl: string | null;
} {
	const target = useWorkspaceHostTarget(workspaceId);
	if (target.status !== "ready")
		return { home: null, hostKind: null, hostUrl: null };
	return {
		home: target.kind === "sandbox" ? "cloud" : "host",
		hostKind: target.kind,
		hostUrl: target.url,
	};
}

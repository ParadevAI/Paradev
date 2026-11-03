import type { getHostServiceClientByUrl } from "@/lib/host-service/client";

/** Shows a chat started here in a background tab of the host's desktop app, when one is attached. */
export function openDesktopChatTab(
	client: ReturnType<typeof getHostServiceClientByUrl>,
	workspaceId: string,
	sessionId: string,
): void {
	void client.panes.newTab.mutate({ workspaceId, sessionId }).catch(() => {});
}

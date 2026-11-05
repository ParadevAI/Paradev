import type { getHostServiceClientByUrl } from "@/lib/host-service/client";

/** Shows a chat started here in a background tab of the host's desktop app, when one is attached. */
export function openDesktopChatTab(
	client: ReturnType<typeof getHostServiceClientByUrl>,
	workspaceId: string,
	sessionId: string,
): void {
	void client.panes.newTab
		.mutate({ workspaceId, sessionId })
		.catch((error: unknown) => {
			const code = (error as { data?: { code?: string } } | null)?.data?.code;
			if (code === "PRECONDITION_FAILED" || code === "NOT_FOUND") return;
			console.warn("[openDesktopChatTab] failed", {
				workspaceId,
				sessionId,
				error,
			});
		});
}

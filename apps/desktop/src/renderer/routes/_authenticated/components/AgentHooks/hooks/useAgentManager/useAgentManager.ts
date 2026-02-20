import { useEffect, useRef } from "react";
import { authClient, getAuthToken } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Starts the AgentManager on the main process when auth is ready.
 * Restarts when the active organization changes.
 */
export function useAgentManager() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId;
	const authToken = getAuthToken();
	const startMutation = electronTrpc.chatService.start.useMutation();
	const mutateRef = useRef(startMutation.mutateAsync);
	mutateRef.current = startMutation.mutateAsync;
	const prevStartKeyRef = useRef<string | null>(null);

	useEffect(() => {
		if (!organizationId) return;
		if (!authToken) return;
		const startKey = `${organizationId}:${authToken}`;
		if (startKey === prevStartKeyRef.current) return;

		void mutateRef
			.current({ organizationId, authToken })
			.then(() => {
				prevStartKeyRef.current = startKey;
			})
			.catch((error) => {
				console.error("[useAgentManager] Failed to start chat service:", error);
			});
	}, [organizationId, authToken]);
}

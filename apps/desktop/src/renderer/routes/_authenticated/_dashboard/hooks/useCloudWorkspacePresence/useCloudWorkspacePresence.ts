import type { PresenceVisitor } from "@superset/shared/page-presence";
import { realtimeWorkspacePresencePath } from "@superset/shared/realtime";
import { useJoinPresence, usePresenceVisitors } from "@superset/ui/presence";
import { useCallback } from "react";
import { env } from "renderer/env.renderer";
import { ensureFreshJwt } from "renderer/lib/auth-client";

/**
 * Who is in a cloud workspace now and who has been. Only someone using the
 * workspace counts as a visit; an observer, like its record view, does not.
 */
export function useCloudWorkspacePresence(
	workspaceId: string,
	{
		organizationId,
		observe,
	}: { organizationId: string | undefined; observe: boolean },
): PresenceVisitor[] {
	const roomId = `workspace:${workspaceId}:${observe ? "observe" : "visit"}`;

	const url = useCallback(async () => {
		const token = await ensureFreshJwt();
		if (!token || !organizationId) return null;
		const address = new URL(
			realtimeWorkspacePresencePath(organizationId, workspaceId),
			env.REALTIME_URL.replace(/^http/, "ws"),
		);
		address.searchParams.set("token", token);
		if (observe) address.searchParams.set("observe", "1");
		return address.toString();
	}, [organizationId, workspaceId, observe]);

	useJoinPresence({
		roomId,
		url: organizationId ? url : undefined,
	});
	return usePresenceVisitors(roomId);
}

import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

const REFRESH_MS = 30_000;

/** The Dev that created a workspace with the person's access, or null. */
export function useDevWorkspaceCreator(workspaceId: string): string | null {
	const enabled = useFeatureFlagEnabled(FEATURE_FLAGS.CHANNELS) === true;
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.chats.devWorkspaces.useQuery(
		{ organizationId: organizationId ?? "" },
		{
			enabled: enabled && !!organizationId,
			staleTime: REFRESH_MS,
			refetchInterval: REFRESH_MS,
		},
	);
	const creators = useMemo(
		() => new Map(data?.map((row) => [row.workspaceId, row.devId])),
		[data],
	);
	return creators.get(workspaceId) ?? null;
}

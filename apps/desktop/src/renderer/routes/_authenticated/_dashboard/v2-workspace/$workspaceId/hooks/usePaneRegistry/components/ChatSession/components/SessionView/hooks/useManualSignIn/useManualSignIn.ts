import { isManualSignIn } from "@superset/shared/agent-credentials";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";

/**
 * A box runs on its creator's sign-ins, and only the creator's own settings
 * can be read here, so the answer is false in anyone else's box.
 */
export function manualSignInFor(args: {
	presetId: string | undefined;
	creatorUserId: string | null | undefined;
	userId: string | undefined;
	credentials: ReadonlyArray<{ agent: string; provider: string | null }>;
}): boolean {
	if (!args.presetId || !args.userId) return false;
	if (args.creatorUserId !== args.userId) return false;
	return args.credentials.some(
		(row) => row.agent === args.presetId && isManualSignIn(row),
	);
}

export function useManualSignIn(presetId: string | undefined): {
	manualSignIn: boolean;
	openAgentSettings: () => void;
} {
	const navigate = useNavigate();
	const openAgentSettings = useCallback(
		() => void navigate({ to: "/settings/agent-accounts" }),
		[navigate],
	);
	const { workspace } = useWorkspace();
	const { workspaces } = useCloudWorkspaces();
	const { data: session } = authClient.useSession();
	const box = workspaces?.find((row) => row.id === workspace.hostId);
	const userId = session?.user?.id;
	const ownBox = Boolean(box && userId && box.createdBy?.userId === userId);
	const credentials = cloudTrpc.agentCredential.list.useQuery(undefined, {
		enabled: ownBox && Boolean(presetId),
	});
	const manualSignIn = manualSignInFor({
		presetId,
		creatorUserId: box?.createdBy?.userId,
		userId,
		credentials: credentials.data ?? [],
	});
	return { manualSignIn, openAgentSettings };
}

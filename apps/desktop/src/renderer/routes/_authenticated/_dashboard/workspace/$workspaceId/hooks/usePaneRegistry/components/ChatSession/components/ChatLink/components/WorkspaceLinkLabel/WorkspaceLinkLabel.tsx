import { Trans } from "@lingui/react/macro";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";

export function WorkspaceLinkLabel({ workspaceId }: { workspaceId: string }) {
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find(({ id }) => id === workspaceId);
	return workspace?.name ?? <Trans>Workspace</Trans>;
}

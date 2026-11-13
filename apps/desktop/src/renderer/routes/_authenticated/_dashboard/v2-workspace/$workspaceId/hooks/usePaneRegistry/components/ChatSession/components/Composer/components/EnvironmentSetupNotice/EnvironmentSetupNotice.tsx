import { cn } from "@superset/ui/utils";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { SetUpEnvironmentButton } from "renderer/routes/_authenticated/components/SetUpEnvironmentButton";

/** Offers the setup request while the cloud workspace's environment has never been checkpointed. */
export function EnvironmentSetupNotice({
	className,
	workspaceId,
	onSetUp,
}: {
	className?: string;
	workspaceId: string;
	onSetUp: () => void;
}) {
	const { workspaces, organizationId } = useCloudWorkspaces();
	const environmentId = workspaces?.find(
		(workspace) => workspace.id === workspaceId,
	)?.environmentId;
	const environments = cloudTrpc.environment.list.useQuery(
		{ organizationId: organizationId ?? "" },
		{ enabled: !!environmentId && !!organizationId },
	);
	const environment = environments.data?.find(
		(row) => row.id === environmentId,
	);
	if (environment?.sourceKind !== "image") return null;
	return (
		<div className={cn("mb-1.5 flex", className)}>
			<SetUpEnvironmentButton onClick={onSetUp} />
		</div>
	);
}

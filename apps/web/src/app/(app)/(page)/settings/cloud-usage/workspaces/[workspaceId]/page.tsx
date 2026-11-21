import { cloudUsageAccess } from "../../utils/cloudUsageAccess";
import { CloudWorkspaceSettings } from "./components/CloudWorkspaceSettings";

export default async function CloudWorkspacePage({
	params,
}: {
	params: Promise<{ workspaceId: string }>;
}) {
	const { organizationId } = await cloudUsageAccess();
	const { workspaceId } = await params;
	return (
		<CloudWorkspaceSettings key={organizationId} workspaceId={workspaceId} />
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { CloudUsageGate } from "../../components/CloudUsageGate";
import { cloudUsageSearch } from "../../utils/cloudUsageSearch";
import { CloudWorkspaceSettings } from "./components/CloudWorkspaceSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/cloud-usage/workspaces/$workspaceId/",
)({
	component: CloudWorkspaceSettingsPage,
	validateSearch: cloudUsageSearch,
});

function CloudWorkspaceSettingsPage() {
	const { workspaceId } = Route.useParams();
	const { period } = Route.useSearch();
	return (
		<CloudUsageGate key={useActiveOrganizationId()}>
			{() => (
				<CloudWorkspaceSettings workspaceId={workspaceId} periodId={period} />
			)}
		</CloudUsageGate>
	);
}

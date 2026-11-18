import { createFileRoute } from "@tanstack/react-router";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { CloudUsageGate } from "../components/CloudUsageGate";
import { cloudUsageSearch } from "../utils/cloudUsageSearch";
import { CloudWorkspacesSettings } from "./components/CloudWorkspacesSettings";

export const Route = createFileRoute(
	"/_authenticated/settings/cloud-usage/workspaces/",
)({
	component: CloudWorkspacesSettingsPage,
	validateSearch: cloudUsageSearch,
});

function CloudWorkspacesSettingsPage() {
	const { period, ...filters } = Route.useSearch();
	return (
		<CloudUsageGate key={useActiveOrganizationId()}>
			{(isAdmin) => (
				<CloudWorkspacesSettings
					isAdmin={isAdmin}
					periodId={period}
					filters={filters}
				/>
			)}
		</CloudUsageGate>
	);
}

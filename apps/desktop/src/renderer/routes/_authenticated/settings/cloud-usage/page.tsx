import { createFileRoute } from "@tanstack/react-router";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { CloudUsageGate } from "./components/CloudUsageGate";
import { CloudUsageSettings } from "./components/CloudUsageSettings";
import { cloudUsageSearch } from "./utils/cloudUsageSearch";

export const Route = createFileRoute("/_authenticated/settings/cloud-usage/")({
	component: CloudUsageSettingsPage,
	validateSearch: cloudUsageSearch,
});

function CloudUsageSettingsPage() {
	const { period } = Route.useSearch();
	return (
		<CloudUsageGate key={useActiveOrganizationId()}>
			{(isAdmin) => <CloudUsageSettings isAdmin={isAdmin} periodId={period} />}
		</CloudUsageGate>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { CloudUsageSettings } from "./components/CloudUsageSettings";

export const Route = createFileRoute("/_authenticated/settings/cloud-usage/")({
	component: CloudUsageSettingsPage,
});

function CloudUsageSettingsPage() {
	return <CloudUsageSettings key={useActiveOrganizationId()} />;
}

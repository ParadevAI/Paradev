import { CloudUsageSettings } from "./components/CloudUsageSettings";
import { cloudUsageAccess } from "./utils/cloudUsageAccess";

export default async function CloudUsagePage() {
	const { organizationId, isAdmin } = await cloudUsageAccess();
	return <CloudUsageSettings key={organizationId} isAdmin={isAdmin} />;
}

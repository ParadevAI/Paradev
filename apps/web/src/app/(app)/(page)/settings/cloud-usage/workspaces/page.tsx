import { cloudUsageAccess } from "../utils/cloudUsageAccess";
import { CloudWorkspacesSettings } from "./components/CloudWorkspacesSettings";

export default async function CloudWorkspacesPage() {
	const { organizationId, isAdmin } = await cloudUsageAccess();
	return <CloudWorkspacesSettings key={organizationId} isAdmin={isAdmin} />;
}

import { DashboardShell } from "./components/DashboardShell";
import { cloudUsageEnabled } from "./utils/cloudUsageEnabled";
import { requireSession } from "./utils/requireSession";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireSession();

	return (
		<DashboardShell showCloudUsage={await cloudUsageEnabled()}>
			{children}
		</DashboardShell>
	);
}

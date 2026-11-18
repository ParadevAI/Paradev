import { DashboardShell } from "./components/DashboardShell";
import { FeatureFlagsProvider } from "./providers/FeatureFlagsProvider";
import { cloudUsageEnabled } from "./utils/cloudUsageEnabled";
import { requireSession } from "./utils/requireSession";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireSession();

	return (
		<FeatureFlagsProvider
			flags={cloudUsageEnabled().then((cloudUsage) => ({ cloudUsage }))}
		>
			<DashboardShell>{children}</DashboardShell>
		</FeatureFlagsProvider>
	);
}

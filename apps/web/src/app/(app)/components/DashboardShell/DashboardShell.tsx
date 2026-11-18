import { AppSidebar } from "./components/AppSidebar";

export function DashboardShell({
	children,
	showCloudUsage,
}: {
	children: React.ReactNode;
	showCloudUsage: boolean;
}) {
	return (
		<div className="flex h-dvh w-full flex-col overflow-hidden bg-background md:flex-row">
			<AppSidebar showCloudUsage={showCloudUsage} />
			<main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
				{children}
			</main>
		</div>
	);
}

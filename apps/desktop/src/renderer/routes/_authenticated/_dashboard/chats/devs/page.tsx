import { createFileRoute } from "@tanstack/react-router";
import { DevDirectory } from "./components/DevDirectory";

export const Route = createFileRoute("/_authenticated/_dashboard/chats/devs/")({
	component: DevDirectoryPage,
	validateSearch: (search: Record<string, unknown>): { groupId?: string } =>
		typeof search.groupId === "string" ? { groupId: search.groupId } : {},
});

function DevDirectoryPage() {
	const { groupId } = Route.useSearch();
	return <DevDirectory key={groupId ?? ""} groupId={groupId} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { ListingScreen } from "./components/ListingScreen";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/chats/devs/$slug/",
)({
	component: ListingPage,
	validateSearch: (search: Record<string, unknown>): { groupId?: string } =>
		typeof search.groupId === "string" ? { groupId: search.groupId } : {},
});

function ListingPage() {
	const { slug } = Route.useParams();
	const { groupId } = Route.useSearch();
	return <ListingScreen key={slug} slug={slug} groupId={groupId} />;
}

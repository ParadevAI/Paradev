import { createFileRoute } from "@tanstack/react-router";
import { ChannelScreen } from "./components/ChannelScreen";

export type ChannelSearch = { thread?: string };

export const Route = createFileRoute(
	"/_authenticated/_dashboard/channels/$channelId/",
)({
	component: ChannelPage,
	validateSearch: (search: Record<string, unknown>): ChannelSearch => ({
		thread:
			typeof search.thread === "string" && search.thread
				? search.thread
				: undefined,
	}),
});

function ChannelPage() {
	const { channelId } = Route.useParams();
	const { thread } = Route.useSearch();
	return (
		<ChannelScreen key={channelId} channelId={channelId} thread={thread} />
	);
}

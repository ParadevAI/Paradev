import { createFileRoute } from "@tanstack/react-router";
import { ChannelView } from "./components/ChannelView";

export type ChannelSearch = {
	thread?: string;
	message?: string;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/channels/$channelId/",
)({
	component: ChannelPage,
	validateSearch: (search: Record<string, unknown>): ChannelSearch => ({
		thread:
			typeof search.thread === "string" && search.thread
				? search.thread
				: undefined,
		message:
			typeof search.message === "string" && search.message
				? search.message
				: undefined,
	}),
});

function ChannelPage() {
	const { channelId } = Route.useParams();
	const { thread } = Route.useSearch();
	return <ChannelView key={channelId} channelId={channelId} thread={thread} />;
}

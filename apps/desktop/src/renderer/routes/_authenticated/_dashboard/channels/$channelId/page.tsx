import { createFileRoute } from "@tanstack/react-router";
import type { ChannelDetailsTab } from "./components/ChannelDetailsDialog";
import { ChannelScreen } from "./components/ChannelScreen";

const DETAILS_TABS: readonly ChannelDetailsTab[] = [
	"about",
	"members",
	"settings",
];

export type ChannelSearch = {
	thread?: string;
	message?: string;
	details?: ChannelDetailsTab;
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
		details: DETAILS_TABS.find((tab) => tab === search.details),
	}),
});

function ChannelPage() {
	const { channelId } = Route.useParams();
	const { thread, message, details } = Route.useSearch();
	return (
		<ChannelScreen
			key={channelId}
			channelId={channelId}
			thread={thread}
			message={message}
			details={details}
		/>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "./components/ChatScreen";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/chats/$chatId/",
)({
	component: ChatPage,
	validateSearch: (search: Record<string, unknown>): { task?: string } =>
		typeof search.task === "string" ? { task: search.task } : {},
});

function ChatPage() {
	const { chatId } = Route.useParams();
	const { task } = Route.useSearch();
	return (
		<ChatScreen
			key={`${chatId}:${task ?? ""}`}
			chatId={chatId}
			initialTaskId={task}
		/>
	);
}

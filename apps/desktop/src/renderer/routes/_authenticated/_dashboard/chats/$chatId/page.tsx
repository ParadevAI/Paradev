import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "./components/ChatScreen";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/chats/$chatId/",
)({
	component: ChatPage,
});

function ChatPage() {
	const { chatId } = Route.useParams();
	return <ChatScreen key={chatId} chatId={chatId} />;
}

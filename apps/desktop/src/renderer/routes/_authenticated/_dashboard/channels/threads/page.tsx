import { createFileRoute } from "@tanstack/react-router";
import { ThreadsScreen } from "./components/ThreadsScreen";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/channels/threads/",
)({
	component: ThreadsScreen,
});

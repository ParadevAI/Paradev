import { createFileRoute } from "@tanstack/react-router";
import { AllTasksView } from "./components/AllTasksView";

export const Route = createFileRoute("/_authenticated/_dashboard/chats/tasks/")(
	{ component: AllTasksView },
);

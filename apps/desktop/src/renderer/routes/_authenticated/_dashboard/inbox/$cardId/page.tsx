import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue } from "react";
import { Redirect } from "renderer/components/Redirect";
import { useInboxEnabled } from "renderer/routes/_authenticated/_dashboard/hooks/useInboxEnabled";
import { useInboxSelectionStore } from "renderer/routes/_authenticated/_dashboard/stores/inboxSelectionStore";
import { finishedWorkspaceId } from "renderer/routes/_authenticated/_dashboard/utils/inboxSelection";
import { FinishedWorkspaceView } from "./components/FinishedWorkspaceView";
import { InboxCardView } from "./components/InboxCardView";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/inbox/$cardId/",
)({ component: InboxCardPage });

function InboxCardPage() {
	const routeId = Route.useParams().cardId;
	const selectedId = useInboxSelectionStore((state) => state.selectedId);
	const cardId = useDeferredValue(selectedId ?? routeId);
	const isEnabled = useInboxEnabled();

	if (!isEnabled) return <Redirect to="/v2-workspaces" />;

	const workspaceId = finishedWorkspaceId(cardId);
	return workspaceId ? (
		<FinishedWorkspaceView key={cardId} workspaceId={workspaceId} />
	) : (
		<InboxCardView cardId={cardId} />
	);
}

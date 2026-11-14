import { workspaceTrpc } from "@superset/workspace-client";
import { useState } from "react";
import { CheckoutFailureNotice } from "./components/CheckoutFailureNotice";

const POLL_MS = 3_000;

export function WorkspaceCheckoutFailureBanner({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const [dismissedId, setDismissedId] = useState<string | null>(null);
	const { data } = workspaceTrpc.workspace.get.useQuery(
		{ id: workspaceId },
		{
			refetchInterval: (query) =>
				query.state.data?.checkouts?.some(
					(checkout) => checkout.boxCheckout?.state === "cloning",
				)
					? POLL_MS
					: false,
		},
	);
	if (!data || dismissedId === workspaceId) return null;
	return (
		<CheckoutFailureNotice
			checkouts={data.checkouts ?? []}
			onDismiss={() => setDismissedId(workspaceId)}
		/>
	);
}

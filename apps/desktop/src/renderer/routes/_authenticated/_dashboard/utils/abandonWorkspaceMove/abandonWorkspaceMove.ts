import { rawErrorMessage } from "@superset/i18n/errors";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";

/** Ends a begun workspace move that failed before it had a destination, so the workspace can move again. */
export async function abandonWorkspaceMove(
	workspaceMoveId: string,
	error: unknown,
): Promise<void> {
	await cloudTrpcClient.workspaceMove.abandon
		.mutate({
			workspaceMoveId,
			error:
				rawErrorMessage(error).slice(0, 2000) || "The move could not start",
		})
		.catch((abandonError: unknown) =>
			console.warn(
				`[workspace-move] could not record that move ${workspaceMoveId} stopped`,
				abandonError,
			),
		);
}

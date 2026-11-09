import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { rawErrorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { MOVE_CANCELLED } from "../describeMoveError";

/** Ends a begun workspace move that failed before it had a destination, so the workspace can move again. */
export async function abandonWorkspaceMove(
	workspaceMoveId: string,
	error: unknown,
): Promise<void> {
	await cloudTrpcClient.workspaceMove.abandon
		.mutate({
			workspaceMoveId,
			error: isAbort(error)
				? MOVE_CANCELLED
				: rawErrorMessage(error).slice(0, 2000) || "The move could not start",
		})
		.catch((abandonError: unknown) => {
			console.warn(
				`[workspace-move] could not record that move ${workspaceMoveId} stopped`,
				abandonError,
			);
			toast.error(i18n._(msg({ message: "Couldn't end the move" })), {
				description: i18n._(
					msg({
						message:
							"Your workspace is unchanged. You can move it again in a few minutes.",
					}),
				),
			});
		});
}

function isAbort(error: unknown): boolean {
	return error instanceof DOMException && error.name === "AbortError";
}

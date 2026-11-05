import { useLingui } from "@lingui/react/macro";
import type { SessionClient } from "@superset/chat/client";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";

export function useMoveToBackground(
	client: Pick<SessionClient, "backgroundSubagent">,
): (taskId: string) => void {
	const { t } = useLingui();
	return useCallback(
		(taskId: string) =>
			void client
				.backgroundSubagent(taskId)
				.then((result) => {
					if (result === "unsupported")
						toast.error(
							t({
								message: "Update this host to move subagents to the background",
							}),
						);
					else if (result === "refused")
						toast.error(
							t({ message: "This subagent can't move to the background now" }),
						);
				})
				.catch((error: unknown) => {
					console.warn(
						"[useMoveToBackground] could not move the subagent",
						error,
					);
					toast.error(
						t({ message: "Couldn't move the subagent to the background" }),
					);
				}),
		[client, t],
	);
}

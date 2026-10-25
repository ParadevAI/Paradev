import { useLingui } from "@lingui/react/macro";
import { userMessageText } from "@superset/chat/core";
import type { UserMessage } from "@superset/chat/protocol";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import type { DrawerQueue } from "../../types";

const ALREADY_GONE = /is not queued$/;

export function useQueueActions(
	promptQueue: DrawerQueue | undefined,
	appendToComposer: (text: string) => void,
) {
	const { t } = useLingui();

	const runQueueAction = useCallback(
		async (action: () => Promise<void>) => {
			try {
				await action();
				return true;
			} catch (error) {
				toast.error(t({ message: "Couldn't update the queue" }), {
					description: errorMessage(error, t({ message: "Unknown error" })),
				});
				return false;
			}
		},
		[t],
	);

	const editQueued = useCallback(
		async (prompt: UserMessage) => {
			if (!promptQueue) return;
			if (!(await runQueueAction(() => promptQueue.remove(prompt.id)))) return;
			appendToComposer(userMessageText(prompt));
		},
		[promptQueue, runQueueAction, appendToComposer],
	);

	const clearQueued = useCallback(async () => {
		if (!promptQueue) return;
		await runQueueAction(async () => {
			const results = await Promise.allSettled(
				promptQueue.prompts.map((prompt) => promptQueue.remove(prompt.id)),
			);
			const failed = results.find(
				(result): result is PromiseRejectedResult =>
					result.status === "rejected" &&
					!ALREADY_GONE.test(rawErrorMessage(result.reason)),
			);
			if (failed) throw failed.reason;
		});
	}, [promptQueue, runQueueAction]);

	return {
		onClear: () => void clearQueued(),
		onEdit: (prompt: UserMessage) => void editQueued(prompt),
		onRemove: (id: string) => {
			if (promptQueue) void runQueueAction(() => promptQueue.remove(id));
		},
		onResume: () => {
			if (promptQueue) void runQueueAction(promptQueue.resume);
		},
		onSteer: (id: string) => {
			if (promptQueue) void runQueueAction(() => promptQueue.steer(id));
		},
	};
}

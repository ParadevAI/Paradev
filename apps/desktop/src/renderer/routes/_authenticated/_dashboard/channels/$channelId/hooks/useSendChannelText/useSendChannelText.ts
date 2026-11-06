import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useApplyChannelMessage } from "renderer/routes/_authenticated/hooks/useApplyChannelMessage";
import { pendingMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";

/**
 * Posts a line of plain text to a channel as the person, shown at once and
 * withdrawn with a notice if the send fails: what a tapped answer needs,
 * without the composer.
 */
export function useSendChannelText(
	channelId: string,
	currentUserId: string | null,
) {
	const { t } = useLingui();
	const { apply, discard } = useApplyChannelMessage();
	const send = cloudTrpc.channelMessage.send.useMutation();
	const { mutateAsync } = send;
	return useCallback(
		(
			body: string,
			options: { threadRootId?: string | null; mentionedIds?: string[] } = {},
		) => {
			if (!currentUserId) return;
			const threadRootId = options.threadRootId ?? null;
			const mentionedIds = options.mentionedIds ?? [];
			const pending = pendingMessage({
				channelId,
				authorId: currentUserId,
				body,
				clientId: crypto.randomUUID(),
				threadRootId,
				mentionedIds,
			});
			apply(pending);
			void mutateAsync({
				channelId,
				body,
				threadRootId,
				clientId: pending.id,
				mentionedIds,
				fileIds: [],
			})
				.then(apply)
				.catch((error: unknown) => {
					discard(pending);
					toast.error(
						errorMessage(error, t({ message: "Couldn't send the message" })),
					);
				});
		},
		[channelId, currentUserId, apply, discard, mutateAsync, t],
	);
}

import { useLingui } from "@lingui/react/macro";
import type { MessageComposerSubmitPayload } from "@superset/chat-ui/MessageComposer";
import { MessageComposer } from "@superset/chat-ui/MessageComposer";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useComposerDictation } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useComposerDictation";
import { useApplyChannelMessage } from "renderer/routes/_authenticated/hooks/useApplyChannelMessage";
import { pendingMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import {
	mentionedUserIds,
	useChannelMentionGroups,
} from "../../hooks/useChannelMentionGroups";
import { useEmojiSuggestions } from "../../hooks/useEmojiSuggestions";
import type { ChannelPerson } from "../ChannelMessageRow";
import { uploadChannelFile } from "./utils/uploadChannelFile";

interface ChannelComposerProps {
	channelId: string;
	threadRootId: string | null;
	people: ChannelPerson[];
	currentUserId: string;
	placeholder: string;
	autoFocus?: boolean;
}

export function ChannelComposer({
	channelId,
	threadRootId,
	people,
	currentUserId,
	placeholder,
	autoFocus,
}: ChannelComposerProps) {
	const { t } = useLingui();
	const { apply, discard } = useApplyChannelMessage();
	const send = cloudTrpc.channelMessage.send.useMutation();
	const dictation = useComposerDictation();
	const getMentionGroups = useChannelMentionGroups({
		channelId,
		people,
		currentUserId,
	});
	const getEmojiSuggestions = useEmojiSuggestions();
	/** A failed message's text, put back in a fresh composer. */
	const [draft, setDraft] = useState<{ key: number; markdown: string }>({
		key: 0,
		markdown: "",
	});

	const onSubmit = (payload: MessageComposerSubmitPayload) => {
		const body = payload.text.trim();
		if (!body && payload.files.length === 0) return false;
		const previews = payload.files.map((file) => ({
			id: crypto.randomUUID(),
			name: file.name,
			contentType: file.type,
			url: URL.createObjectURL(file),
		}));
		const pending = pendingMessage({
			channelId,
			authorUserId: currentUserId,
			body,
			clientId: crypto.randomUUID(),
			threadRootId,
			mentionedUserIds: mentionedUserIds(payload.mentions),
			attachments: previews,
		});
		const release = () => {
			for (const preview of previews) URL.revokeObjectURL(preview.url);
		};
		const fail = (error: unknown) => {
			discard(pending);
			release();
			if (body) {
				setDraft((current) => ({ key: current.key + 1, markdown: body }));
			}
			toast.error(
				errorMessage(
					error,
					payload.files.length > 0
						? t({
								message: "Couldn't send the message. Attach the files again.",
							})
						: t({ message: "Couldn't send the message" }),
				),
			);
		};
		apply(pending);
		void Promise.all(payload.files.map(uploadChannelFile))
			.then((fileIds) =>
				send.mutateAsync({
					channelId,
					body,
					threadRootId,
					clientId: pending.id,
					mentionedUserIds: pending.mentionedUserIds,
					fileIds,
				}),
			)
			.then((sent) => {
				apply(sent);
				release();
			}, fail);
	};

	return (
		<MessageComposer
			key={draft.key}
			initialMarkdown={draft.markdown || undefined}
			placeholder={placeholder}
			getMentionGroups={getMentionGroups}
			getEmojiSuggestions={getEmojiSuggestions}
			allowAttachments
			onSubmit={onSubmit}
			dictation={dictation}
			autoFocus={autoFocus}
		/>
	);
}

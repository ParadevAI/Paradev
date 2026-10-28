import { useLingui } from "@lingui/react/macro";
import type { MessageComposerSubmitPayload } from "@superset/chat-ui/MessageComposer";
import { MessageComposer } from "@superset/chat-ui/MessageComposer";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useComposerDictation } from "renderer/routes/_authenticated/components/AgentComposer/hooks/useComposerDictation";
import { useApplyChannelMessage } from "renderer/routes/_authenticated/hooks/useApplyChannelMessage";
import { pendingMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import {
	mentionedIds,
	useChannelMentions,
} from "../../hooks/useChannelMentions";
import { useEmojiSuggestions } from "../../hooks/useEmojiSuggestions";
import { strongestBroadcast } from "../../utils/mentionGroups";
import type { ChannelPerson } from "../ChannelMessageRow";
import { MentionInvitePrompt } from "./components/MentionInvitePrompt";
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
	const { mentionProviders, renderChip } = useChannelMentions({
		channelId,
		people,
		currentUserId,
	});
	const getEmojiSuggestions = useEmojiSuggestions();
	const { data: channel } = cloudTrpc.channel.get.useQuery({ channelId });
	const { data: members } = cloudTrpc.channel.members.useQuery({ channelId });
	const [outsiderIds, setOutsiderIds] = useState<string[]>([]);
	const outsiders = useMemo(() => {
		const memberIds = new Set((members ?? []).map((m) => m.actorId));
		return people.filter(
			(person) => outsiderIds.includes(person.id) && !memberIds.has(person.id),
		);
	}, [people, members, outsiderIds]);
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
			authorId: currentUserId,
			body,
			clientId: crypto.randomUUID(),
			threadRootId,
			mentionedIds: mentionedIds(payload.mentions),
			broadcast: strongestBroadcast(payload.mentions),
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
					mentionedIds: pending.mentionedIds,
					broadcast: pending.broadcast,
					fileIds,
				}),
			)
			.then((sent) => {
				apply(sent);
				release();
				const memberIds = new Set((members ?? []).map((m) => m.actorId));
				setOutsiderIds(
					[...new Set(pending.mentionedIds)].filter(
						(id) => id !== currentUserId && !memberIds.has(id),
					),
				);
			}, fail);
	};

	return (
		<>
			{channel && outsiders.length > 0 && (
				<MentionInvitePrompt
					channelId={channelId}
					channelName={channel.name}
					people={outsiders}
					onDone={() => setOutsiderIds([])}
				/>
			)}
			<MessageComposer
				key={draft.key}
				initialMarkdown={draft.markdown || undefined}
				placeholder={placeholder}
				mentionProviders={mentionProviders}
				renderChip={renderChip}
				getEmojiSuggestions={getEmojiSuggestions}
				allowAttachments
				onSubmit={onSubmit}
				dictation={dictation}
				autoFocus={autoFocus}
			/>
		</>
	);
}

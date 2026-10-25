import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionProvider,
	PromptInputSubmitPayload,
} from "@superset/chat-ui/PromptInput";
import { PromptInput } from "@superset/chat-ui/PromptInput";
import { errorMessage } from "@superset/i18n/errors";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { toast } from "@superset/ui/sonner";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useApplyChannelMessage } from "renderer/routes/_authenticated/hooks/useApplyChannelMessage";
import { pendingMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import type { ChannelPerson } from "../ChannelMessageRow";

const NO_COMMANDS: never[] = [];

interface ChannelComposerProps {
	channelId: string;
	threadRootId: string | null;
	people: ChannelPerson[];
	currentUserId: string;
	placeholder: string;
	autoFocus?: boolean;
}

function mentionedIds(payload: PromptInputSubmitPayload): string[] {
	return payload.mentions.flatMap((chip) => {
		const data = chip.data as { userId?: unknown } | undefined;
		return typeof data?.userId === "string" ? [data.userId] : [];
	});
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

	const mentionProviders = useMemo<ComposerMentionProvider[]>(
		() => [
			{
				id: "people",
				title: t({ message: "People" }),
				priority: 100,
				source: {
					kind: "static",
					load: () =>
						people
							.filter((person) => person.id !== currentUserId)
							.map((person) => ({
								id: person.id,
								label: person.name,
								icon: (
									<Avatar
										size="xs"
										fullName={person.name}
										image={person.image}
									/>
								),
								select: (ctx) =>
									ctx.insertChip({
										label: person.name,
										serialized: `@${person.name}`,
										data: { userId: person.id },
									}),
							})),
				},
			},
		],
		[people, currentUserId, t],
	);

	const onSubmit = (payload: PromptInputSubmitPayload) => {
		const body = payload.text.trim();
		if (!body) return false;
		const pending = pendingMessage({
			channelId,
			authorUserId: currentUserId,
			body,
			clientId: crypto.randomUUID(),
			threadRootId,
			mentionedUserIds: mentionedIds(payload),
		});
		apply(pending);
		send.mutate(
			{
				channelId,
				body,
				threadRootId,
				clientId: pending.id,
				mentionedUserIds: pending.mentionedUserIds,
			},
			{
				onSuccess: apply,
				onError: (error) => {
					discard(pending);
					toast.error(
						errorMessage(error, t({ message: "Couldn't send the message" })),
					);
				},
			},
		);
	};

	return (
		<PromptInput
			placeholder={placeholder}
			mentionProviders={mentionProviders}
			commands={NO_COMMANDS}
			onSubmit={onSubmit}
			allowAttachments={false}
			autoFocus={autoFocus}
		/>
	);
}

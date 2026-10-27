import { useLingui } from "@lingui/react/macro";
import { MessageComposer } from "@superset/chat-ui/MessageComposer";
import {
	mentionedUserIds,
	useChannelMentions,
} from "../../../../hooks/useChannelMentions";
import { useEmojiSuggestions } from "../../../../hooks/useEmojiSuggestions";
import type { ChannelPerson } from "../../ChannelMessageRow";

interface MessageEditorProps {
	channelId: string;
	body: string;
	mentionedUserIds: string[];
	people: ChannelPerson[];
	currentUserId: string | null;
	onSave: (edit: { body: string; mentionedUserIds: string[] }) => void;
	onCancel: () => void;
}

/** Editing a sent message in the same composer it was written in, as Slack does. */
export function MessageEditor({
	channelId,
	body,
	mentionedUserIds: existingMentions,
	people,
	currentUserId,
	onSave,
	onCancel,
}: MessageEditorProps) {
	const { t } = useLingui();
	const { mentionProviders, renderChip } = useChannelMentions({
		channelId,
		people,
		currentUserId,
	});
	const getEmojiSuggestions = useEmojiSuggestions();
	return (
		<MessageComposer
			className="py-1"
			initialMarkdown={body}
			placeholder={t({ message: "Edit message" })}
			mentionProviders={mentionProviders}
			renderChip={renderChip}
			getEmojiSuggestions={getEmojiSuggestions}
			onCancel={onCancel}
			onSubmit={(payload) => {
				const text = payload.text.trim();
				if (!text) return false;
				onSave({
					body: text,
					mentionedUserIds: [
						...new Set([
							...existingMentions,
							...mentionedUserIds(payload.mentions),
						]),
					],
				});
			}}
			autoFocus
		/>
	);
}

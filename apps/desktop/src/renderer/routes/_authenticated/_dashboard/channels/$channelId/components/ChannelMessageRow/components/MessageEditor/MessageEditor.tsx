import { useLingui } from "@lingui/react/macro";
import { MessageComposer } from "@superset/chat-ui/MessageComposer";
import {
	mentionedIds,
	useChannelMentions,
} from "../../../../hooks/useChannelMentions";
import { useEmojiSuggestions } from "../../../../hooks/useEmojiSuggestions";
import type { ChannelPerson } from "../../ChannelMessageRow";

export interface MessageEdit {
	body: string;
	mentionedIds: string[];
}

interface MessageEditorProps {
	channelId: string;
	body: string;
	mentionedIds: string[];
	people: ChannelPerson[];
	currentUserId: string | null;
	onSave: (edit: MessageEdit) => void;
	onCancel: () => void;
}

/** Editing a sent message in the same composer it was written in, as Slack does. */
export function MessageEditor({
	channelId,
	body,
	mentionedIds: existingMentions,
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
					mentionedIds: [
						...new Set([
							...existingMentions,
							...mentionedIds(payload.mentions),
						]),
					],
				});
			}}
			autoFocus
		/>
	);
}

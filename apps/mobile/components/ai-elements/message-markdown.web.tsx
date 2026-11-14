import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import type { MessageMarkdownComponent } from "./message-markdown.types";

export const MessageMarkdown: MessageMarkdownComponent = ({
	markdown,
	markdownStyle,
}) => (
	<EnrichedMarkdownText markdown={markdown} markdownStyle={markdownStyle} />
);

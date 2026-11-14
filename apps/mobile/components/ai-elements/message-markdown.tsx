import { StreamdownText } from "react-native-streamdown";
import type { MessageMarkdownComponent } from "./message-markdown.types";

export const MessageMarkdown: MessageMarkdownComponent = ({
	markdown,
	markdownStyle,
}) => (
	<StreamdownText
		flavor="github"
		markdown={markdown}
		markdownStyle={markdownStyle}
	/>
);

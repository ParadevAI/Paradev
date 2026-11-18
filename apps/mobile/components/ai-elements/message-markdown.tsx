import { StreamdownText } from "react-native-streamdown";
import { openUrl } from "@/lib/open-url";
import type { MessageMarkdownComponent } from "./message-markdown.types";

export const MessageMarkdown: MessageMarkdownComponent = ({
	markdown,
	markdownStyle,
}) => (
	<StreamdownText
		flavor="github"
		markdown={markdown}
		markdownStyle={markdownStyle}
		onLinkPress={({ url }) => openUrl(url)}
	/>
);

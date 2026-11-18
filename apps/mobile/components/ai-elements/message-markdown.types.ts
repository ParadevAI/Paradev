import type { ComponentType } from "react";
import type { MarkdownStyle } from "react-native-enriched-markdown";

export interface MessageMarkdownProps {
	markdown: string;
	markdownStyle: MarkdownStyle;
}

/** Markdown that may still be streaming in. */
export type MessageMarkdownComponent = ComponentType<MessageMarkdownProps>;

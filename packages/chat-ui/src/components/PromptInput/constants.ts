import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { Klass, LexicalNode } from "lexical";
import { MentionChipNode } from "./nodes/mentionChipNode";

export const COMPOSER_NODES: Klass<LexicalNode>[] = [
	MentionChipNode,
	ListNode,
	ListItemNode,
	QuoteNode,
	CodeNode,
	HeadingNode,
	LinkNode,
];

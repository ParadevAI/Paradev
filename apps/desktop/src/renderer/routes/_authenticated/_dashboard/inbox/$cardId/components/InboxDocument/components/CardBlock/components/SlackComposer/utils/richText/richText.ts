import type { JSONContent } from "@tiptap/core";
import { linkLabel } from "../linkLabel";

export interface RichTextStyle {
	bold?: true;
	italic?: true;
	strike?: true;
	code?: true;
	underline?: true;
}

export type RichTextInline =
	| { type: "text"; text: string; style?: RichTextStyle }
	| {
			type: "link";
			url: string;
			text?: string;
			truncated?: true;
			style?: RichTextStyle;
	  }
	| { type: "user"; user_id: string }
	| { type: "channel"; channel_id: string }
	| { type: "broadcast"; range: BroadcastRange }
	| { type: "usergroup"; usergroup_id: string }
	| { type: "emoji"; name: string };

export type BroadcastRange = "channel" | "here" | "everyone";

const BROADCASTS: ReadonlySet<string> = new Set([
	"channel",
	"here",
	"everyone",
]);
const MENTION = /(?<![\w@])@([\w.-]*\w)/g;

interface RichTextSection {
	type: "rich_text_section";
	elements: RichTextInline[];
}

export type RichTextElement =
	| RichTextSection
	| {
			type: "rich_text_list";
			style: "bullet" | "ordered";
			indent: number;
			border: 0;
			elements: RichTextSection[];
	  }
	| { type: "rich_text_quote"; elements: RichTextInline[] }
	| { type: "rich_text_preformatted"; border: 0; elements: RichTextInline[] };

export interface RichTextBlock {
	type: "rich_text";
	elements: RichTextElement[];
}

const STYLE_OF_MARK: Record<string, keyof RichTextStyle> = {
	bold: "bold",
	italic: "italic",
	strike: "strike",
	code: "code",
	underline: "underline",
};

function styleOf(node: JSONContent): RichTextStyle | undefined {
	const style: RichTextStyle = {};
	for (const mark of node.marks ?? []) {
		const key = STYLE_OF_MARK[mark.type];
		if (key) style[key] = true;
	}
	return Object.keys(style).length > 0 ? style : undefined;
}

const sameStyle = (a?: RichTextStyle, b?: RichTextStyle) =>
	JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

function pushText(out: RichTextInline[], text: string, style?: RichTextStyle) {
	if (!text) return;
	const last = out[out.length - 1];
	if (last?.type === "text" && sameStyle(last.style, style)) {
		last.text += text;
		return;
	}
	out.push(style ? { type: "text", text, style } : { type: "text", text });
}

type PushText = typeof pushText;

/** Text with `@channel`, `@here`, `@everyone` and the user groups' handles as the mentions Slack notifies on. */
function notifyingText(groups: ReadonlyMap<string, string>): PushText {
	return (out, text, style) => {
		if (style?.code) return pushText(out, text, style);
		let at = 0;
		for (const match of text.matchAll(MENTION)) {
			const name = match[1] ?? "";
			const group = groups.get(name);
			if (!BROADCASTS.has(name) && !group) continue;
			pushText(out, text.slice(at, match.index), style);
			out.push(
				group
					? { type: "usergroup", usergroup_id: group }
					: { type: "broadcast", range: name as BroadcastRange },
			);
			at = match.index + match[0].length;
		}
		pushText(out, text.slice(at), style);
	};
}

/** A standard emoji's character; workspace emoji have none and go out by name. */
export type EmojiChar = (name: string) => string | undefined;

/** An emoji node keeps the shortcode it was typed as (`rage`), which is not always the catalogue's name (`pout`). */
export function emojiCharLookup(
	items: readonly { name: string; shortcodes: string[]; emoji?: string }[],
): EmojiChar {
	const chars = new Map<string, string>();
	for (const item of items)
		if (item.emoji)
			for (const name of [item.name, ...item.shortcodes])
				if (!chars.has(name)) chars.set(name, item.emoji);
	return (name) => chars.get(name);
}

function inlines(
	nodes: JSONContent[] | undefined,
	emojiChar: EmojiChar,
	pushPlain: PushText,
	out: RichTextInline[] = [],
) {
	for (const node of nodes ?? []) {
		if (node.type === "text") {
			const link = node.marks?.find((m) => m.type === "link");
			const href = link?.attrs?.href as string | undefined;
			if (href) {
				const style = styleOf(node);
				const text = node.text ?? href;
				out.push({
					type: "link",
					url: href,
					...(text !== href ? { text } : {}),
					...(text !== href && text === linkLabel(href)
						? { truncated: true as const }
						: {}),
					...(style ? { style } : {}),
				});
			} else pushPlain(out, node.text ?? "", styleOf(node));
		} else if (node.type === "hardBreak") pushText(out, "\n");
		else if (node.type === "record-mention" && node.attrs?.id)
			out.push({ type: "user", user_id: String(node.attrs.id) });
		else if (node.type === "slackChannel" && node.attrs?.id)
			out.push({ type: "channel", channel_id: String(node.attrs.id) });
		else if (node.type === "emoji" && node.attrs?.name) {
			const name = String(node.attrs.name);
			const char = emojiChar(name);
			if (char) pushText(out, char, styleOf(node));
			else out.push({ type: "emoji", name });
		}
	}
	return out;
}

function lines(
	paragraphs: JSONContent[],
	emojiChar: EmojiChar,
	pushPlain: PushText,
): RichTextInline[] {
	const out: RichTextInline[] = [];
	paragraphs.forEach((paragraph, i) => {
		if (i > 0) pushText(out, "\n");
		inlines(paragraph.content, emojiChar, pushPlain, out);
	});
	return out;
}

function listElements(
	list: JSONContent,
	indent: number,
	emojiChar: EmojiChar,
	pushPlain: PushText,
	out: RichTextElement[],
) {
	const style = list.type === "orderedList" ? "ordered" : "bullet";
	let current: Extract<RichTextElement, { type: "rich_text_list" }> | null =
		null;
	for (const item of list.content ?? []) {
		const own = (item.content ?? []).filter(
			(c) => c.type !== "bulletList" && c.type !== "orderedList",
		);
		if (!current) {
			current = {
				type: "rich_text_list",
				style,
				indent,
				border: 0,
				elements: [],
			};
			out.push(current);
		}
		current.elements.push({
			type: "rich_text_section",
			elements: lines(own, emojiChar, pushPlain),
		});
		for (const nested of item.content ?? []) {
			if (nested.type !== "bulletList" && nested.type !== "orderedList")
				continue;
			listElements(nested, indent + 1, emojiChar, pushPlain, out);
			current = null;
		}
	}
}

/**
 * The `rich_text` block Slack's own composer posts for this document. With
 * `groups` (handle to user-group id) a typed `@channel` or `@handle` goes out
 * as the mention that notifies; without it they stay text.
 */
export function docToRichText(
	doc: JSONContent,
	emojiChar: EmojiChar,
	groups?: ReadonlyMap<string, string>,
): RichTextBlock {
	const pushPlain = groups ? notifyingText(groups) : pushText;
	const elements: RichTextElement[] = [];
	let paragraphs: JSONContent[] = [];
	const flush = (beforeBlock: boolean) => {
		if (paragraphs.length === 0) return;
		const section = lines(paragraphs, emojiChar, pushPlain);
		if (beforeBlock) pushText(section, "\n");
		if (section.length > 0)
			elements.push({ type: "rich_text_section", elements: section });
		paragraphs = [];
	};
	for (const node of doc.content ?? []) {
		if (node.type === "paragraph") {
			paragraphs.push(node);
			continue;
		}
		flush(true);
		if (node.type === "bulletList" || node.type === "orderedList")
			listElements(node, 0, emojiChar, pushPlain, elements);
		else if (node.type === "blockquote")
			elements.push({
				type: "rich_text_quote",
				elements: lines(node.content ?? [], emojiChar, pushPlain),
			});
		else if (node.type === "codeBlock")
			elements.push({
				type: "rich_text_preformatted",
				border: 0,
				elements: inlines(node.content, emojiChar, pushText),
			});
	}
	flush(false);
	trimEnds(elements);
	return { type: "rich_text", elements };
}

/** Whitespace at the very start or end never reaches Slack. */
function trimEnds(elements: RichTextElement[]) {
	const first = elements[0];
	if (first?.type === "rich_text_section") {
		const head = first.elements[0];
		if (head?.type === "text") head.text = head.text.replace(/^\s+/, "");
		if (head?.type === "text" && !head.text) first.elements.shift();
		if (first.elements.length === 0) elements.shift();
	}
	const last = elements[elements.length - 1];
	if (last?.type === "rich_text_section") {
		const tail = last.elements[last.elements.length - 1];
		if (tail?.type === "text") tail.text = tail.text.replace(/\s+$/, "");
		if (tail?.type === "text" && !tail.text) last.elements.pop();
		if (last.elements.length === 0) elements.pop();
	}
}

function escapeMrkdwn(text: string): string {
	return text.replace(/[&<>]/g, (c) =>
		c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
	);
}

function inlineMrkdwn(elements: RichTextInline[]): string {
	return elements
		.map((el) => {
			if (el.type === "user") return `<@${el.user_id}>`;
			if (el.type === "channel") return `<#${el.channel_id}>`;
			if (el.type === "broadcast") return `<!${el.range}>`;
			if (el.type === "usergroup") return `<!subteam^${el.usergroup_id}>`;
			if (el.type === "emoji") return `:${el.name}:`;
			const text =
				el.type !== "link"
					? escapeMrkdwn(el.text)
					: el.text
						? `<${el.url}|${escapeMrkdwn(el.text)}>`
						: `<${el.url}>`;
			const s = el.style ?? {};
			if (s.code) return `\`${text}\``;
			let out = text;
			if (s.strike) out = `~${out}~`;
			if (s.bold) out = `*${out}*`;
			if (s.italic) out = `_${out}_`;
			return out;
		})
		.join("");
}

const BULLETS = ["•", "◦", "▪"];

/** The `text` fallback Slack shows in notifications. */
export function richTextToMrkdwn(block: RichTextBlock): string {
	return block.elements
		.map((el) => {
			if (el.type === "rich_text_section")
				return inlineMrkdwn(el.elements).replace(/\n$/, "");
			if (el.type === "rich_text_quote")
				return inlineMrkdwn(el.elements)
					.split("\n")
					.map((l) => `&gt; ${l}`)
					.join("\n");
			if (el.type === "rich_text_preformatted")
				return `\`\`\`${inlineMrkdwn(el.elements)}\`\`\``;
			return el.elements
				.map(
					(item, i) =>
						`${"    ".repeat(el.indent)}${el.style === "ordered" ? `${i + 1}.` : BULLETS[el.indent % BULLETS.length]} ${inlineMrkdwn(item.elements)}`,
				)
				.join("\n");
		})
		.join("\n");
}

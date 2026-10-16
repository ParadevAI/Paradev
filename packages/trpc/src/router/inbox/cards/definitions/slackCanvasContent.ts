export interface CanvasSection {
	id: string;
	markdown: string;
	/** The words alone, which is what a search for the section matches. */
	text: string;
	/** The section holds something markdown cannot say: a mention, a file, an embed. */
	lossy: boolean;
}

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&apos;": "'",
	"&nbsp;": " ",
};

const decode = (text: string) =>
	text
		.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) =>
			String.fromCodePoint(
				code[0]?.toLowerCase() === "x"
					? Number.parseInt(code.slice(1), 16)
					: Number(code),
			),
		)
		.replace(
			/&(amp|lt|gt|quot|apos|nbsp);/g,
			(entity) => ENTITIES[entity] ?? entity,
		);

const plain = (html: string) => decode(html.replace(/<[^>]+>/g, "")).trim();

const SAYABLE = /<\/?(b|strong|i|em|del|s|code|a|lnk|br|span|p)\b[^>]*>/g;
const lossy = (html: string) => /<[^>]+>/.test(html.replace(SAYABLE, ""));

function inline(html: string): string {
	return decode(
		html
			.replace(/<br\s*\/?>/g, "")
			.replace(/<(b|strong)>([\s\S]*?)<\/\1>/g, "**$2**")
			.replace(/<(i|em)>([\s\S]*?)<\/\1>/g, "_$2_")
			.replace(/<(del|s)>([\s\S]*?)<\/\1>/g, "~~$2~~")
			.replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
			.replace(
				/<(?:a|lnk)\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:a|lnk)>/g,
				"[$2]($1)",
			)
			.replace(/<[^>]+>/g, ""),
	).trim();
}

const idOf = (attributes: string) =>
	/\bid=["']([^"']+)["']/.exec(attributes)?.[1] ?? "";

const LIST_STYLE: Record<string, (index: number, checked: boolean) => string> =
	{
		"5": () => "- ",
		"6": (index) => `${index + 1}. `,
		"7": (_, checked) => (checked ? "- [x] " : "- [ ] "),
	};

const BLOCK =
	/<(h[1-3]|p|pre)\b([^>]*)>([\s\S]*?)<\/\1>|<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>|<div\b[^>]*data-section-style=['"](\d+)['"][^>]*>([\s\S]*?)<\/div>/g;
const ITEM = /<ul\b[^>]*>|<\/ul>|<li\b([^>]*)>([\s\S]*?)<\/li>/g;
const PARAGRAPH = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
const TABLE = /<table\b[\s\S]*?<\/table>/g;

/** Slack serves a canvas as HTML whose element ids are the section ids its edit API takes. The title comes first and is not a section; a table's cells are left out, because replacing one is not defined. */
export function canvasSections(html: string, title = ""): CanvasSection[] {
	const sections: CanvasSection[] = [];
	for (const match of html.replace(TABLE, "").matchAll(BLOCK)) {
		const [, tag, attributes = "", inner = "", quote, style, list = ""] = match;
		if (style) {
			const prefix = LIST_STYLE[style] ?? LIST_STYLE["5"];
			const counts: number[] = [];
			for (const [token, itemAttributes = "", item = ""] of list.matchAll(
				ITEM,
			)) {
				if (token.startsWith("<ul")) {
					counts.push(0);
					continue;
				}
				if (token === "</ul>") {
					counts.pop();
					continue;
				}
				const depth = Math.max(0, counts.length - 1);
				const index = counts[depth] ?? 0;
				counts[depth] = index + 1;
				const checked = /class=['"][^'"]*checked/.test(itemAttributes);
				sections.push({
					id: idOf(itemAttributes),
					markdown: `${"    ".repeat(depth)}${prefix?.(index, checked) ?? "- "}${inline(item)}`,
					text: plain(item),
					lossy: lossy(item),
				});
			}
			continue;
		}
		if (quote !== undefined) {
			for (const [, quoted = "", line = ""] of quote.matchAll(PARAGRAPH))
				sections.push({
					id: idOf(quoted),
					markdown: `> ${inline(line)}`,
					text: plain(line),
					lossy: lossy(line),
				});
			continue;
		}
		const text = plain(inner);
		const code =
			tag === "pre" || /class=["'][^"']*prettyprint/.test(attributes);
		sections.push({
			id: idOf(attributes),
			markdown: code
				? `\`\`\`\n${text}\n\`\`\``
				: tag?.startsWith("h")
					? `${"#".repeat(Number(tag[1]))} ${inline(inner)}`
					: inline(inner),
			text,
			lossy: lossy(inner),
		});
	}
	const body =
		sections[0]?.markdown.startsWith("# ") &&
		(!title || sections[0].text === title)
			? sections.slice(1)
			: sections;
	return body.filter((section) => section.id);
}

const listKind = (indented: string) => kindOf(indented.trimStart());

const kindOf = (line: string) =>
	/^- \[[ x]\] /.test(line)
		? "check"
		: /^- /.test(line)
			? "bullet"
			: /^\d+\. /.test(line)
				? "number"
				: /^> /.test(line)
					? "quote"
					: null;

export function canvasMarkdown(sections: CanvasSection[]): string {
	return sections
		.map((section, index) => {
			const kind = listKind(section.markdown);
			const tight =
				kind !== null && kind === listKind(sections[index - 1]?.markdown ?? "");
			return `${index === 0 ? "" : tight ? "\n" : "\n\n"}${section.markdown}`;
		})
		.join("")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

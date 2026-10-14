import { toString as mdastToString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkGfm);
type MarkdownNode = ReturnType<typeof processor.parse>["children"][number];

function blockText(node: MarkdownNode): string {
	switch (node.type) {
		case "paragraph":
		case "heading":
		case "tableCell":
		case "code":
			return mdastToString(node, {
				includeHtml: false,
				includeImageAlt: false,
			});
		default:
			return "children" in node ? node.children.map(blockText).join("\n") : "";
	}
}

export function markdownText(text: string): string {
	return processor.parse(text).children.map(blockText).join("\n");
}

import { type CommandProps, isNodeActive } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export type SlackBlockKind =
	| "bulletList"
	| "orderedList"
	| "blockquote"
	| "codeBlock";

export function atomText(node: ProseMirrorNode): string {
	if (node.type.name === "record-mention") return `@${node.attrs.label ?? ""}`;
	if (node.type.name === "slackChannel") return `#${node.attrs.label ?? ""}`;
	if (node.type.name === "emoji") return `:${node.attrs.name ?? ""}:`;
	return "";
}

function flattenAtoms({ tr }: CommandProps): boolean {
	const { $from, $to } = tr.selection;
	const atoms: { pos: number; node: ProseMirrorNode }[] = [];
	tr.doc.nodesBetween($from.start(), $to.end(), (node, pos) => {
		if (node.isInline && !node.isText && atomText(node))
			atoms.push({ pos, node });
	});
	for (const { pos, node } of atoms.reverse())
		tr.replaceWith(
			pos,
			pos + node.nodeSize,
			tr.doc.type.schema.text(atomText(node)),
		);
	return true;
}

const isList = (node: ProseMirrorNode) =>
	node.type.name === "bulletList" || node.type.name === "orderedList";

/** Splits the selected items into a list of their own and gives it the other type. */
function retypeListLines(
	{ tr, state }: CommandProps,
	kind: "bulletList" | "orderedList",
): boolean {
	const { $from, $to } = tr.selection;
	const range = $from.blockRange($to, isList);
	const type = state.schema.nodes[kind];
	if (!range || !type) return false;
	let listPos = range.$from.before(range.depth);
	if (range.endIndex < range.parent.childCount) tr.split(range.end);
	if (range.startIndex > 0) {
		tr.split(range.start);
		listPos = range.start + 1;
	}
	tr.setNodeMarkup(listPos, type);
	return true;
}

/** A Slack line takes one block format, so switching list type changes only the selected lines; a quote cannot go inside a list or code block. */
export function toggleSlackBlock(kind: SlackBlockKind) {
	return (props: CommandProps): boolean => {
		const { state, commands } = props;
		if (isNodeActive(state, kind)) return commands.clearNodes();
		if (kind === "blockquote") {
			if (isNodeActive(state, "listItem") || isNodeActive(state, "codeBlock"))
				return true;
			return commands.toggleBlockquote();
		}
		const wrapping =
			kind === "codeBlock"
				? ["listItem", "blockquote"]
				: ["blockquote", "codeBlock"];
		if (wrapping.some((t) => isNodeActive(state, t))) commands.clearNodes();
		if (kind === "codeBlock") {
			flattenAtoms(props);
			return commands.setCodeBlock();
		}
		if (isNodeActive(state, "listItem")) return retypeListLines(props, kind);
		return kind === "bulletList"
			? commands.toggleBulletList()
			: commands.toggleOrderedList();
	};
}

/** ⇧Enter: a new line as its own block, a new item in a list (an empty item leaves it), a new line inside code. */
export function slackNewLine() {
	return ({ state, commands }: CommandProps): boolean => {
		if (isNodeActive(state, "codeBlock")) return commands.newlineInCode();
		if (isNodeActive(state, "listItem"))
			return state.selection.$from.parent.content.size === 0
				? commands.liftListItem("listItem")
				: commands.splitListItem("listItem");
		return commands.splitBlock();
	};
}

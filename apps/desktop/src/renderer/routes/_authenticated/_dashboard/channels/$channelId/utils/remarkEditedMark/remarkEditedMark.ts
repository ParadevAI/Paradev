/** The href of the marker; the message's link renderer draws it as "(edited)". */
export const EDITED_HREF = "#edited";

interface MdNode {
	type: string;
	value?: string;
	url?: string;
	children?: MdNode[];
}

const marker = (): MdNode => ({ type: "link", url: EDITED_HREF, children: [] });

/** Ends the message with the edited marker: inline after the last paragraph, as Slack shows it, or on its own line after a list or code. */
export function remarkEditedMark() {
	return (tree: MdNode) => {
		tree.children ??= [];
		const last = tree.children.at(-1);
		if (last?.type === "paragraph" && last.children) {
			last.children.push({ type: "text", value: " " }, marker());
			return;
		}
		tree.children.push({ type: "paragraph", children: [marker()] });
	};
}

/**
 * A task's description is markdown, so a Dev reads and writes it with `dev task update --description` and every
 * client renders it the same. Checklists are GFM task items (`- [ ] buy`, `- [x] bought`); a description splits into
 * checklist items and the text between them, which is how a page edits it item by item.
 */
export type DescriptionBlock =
	| {
			kind: "check";
			checked: boolean;
			text: string;
			indent: string;
			marker: string;
	  }
	| { kind: "text"; text: string };

const CHECK = /^(\s*)([-*+]) \[([ xX])\](?: (.*))?$/;
const FENCE = /^\s*(```|~~~)/;

/** The description's blocks. Lines inside a fenced code block are text, even when they look like checklist items. */
export function descriptionBlocks(markdown: string): DescriptionBlock[] {
	if (!markdown) return [];
	const blocks: DescriptionBlock[] = [];
	let fence: string | null = null;
	for (const line of markdown.split("\n")) {
		const opens = line.match(FENCE)?.[1];
		if (opens && (!fence || opens === fence)) fence = fence ? null : opens;
		const check = !fence && !opens ? line.match(CHECK) : null;
		if (check) {
			blocks.push({
				kind: "check",
				indent: check[1]!,
				marker: check[2]!,
				checked: check[3] !== " ",
				text: check[4] ?? "",
			});
			continue;
		}
		const last = blocks.at(-1);
		if (last?.kind === "text") last.text += `\n${line}`;
		else blocks.push({ kind: "text", text: line });
	}
	return blocks;
}

/** Blocks back to markdown; the inverse of `descriptionBlocks` (a ticked `[X]` comes back as `[x]`). */
export function descriptionMarkdown(blocks: DescriptionBlock[]): string {
	return blocks
		.map((b) =>
			b.kind === "text"
				? b.text
				: `${b.indent}${b.marker} [${b.checked ? "x" : " "}] ${b.text}`.trimEnd(),
		)
		.join("\n");
}

import type { SlackCanvasView } from "../../../../types";

interface DiffTexts {
	before: string;
	after: string;
}

const lastLine = (text: string) =>
	text
		.split("\n")
		.filter((line) => line.trim() !== "")
		.pop() ?? "";

const firstLine = (text: string) =>
	text.split("\n").find((line) => line.trim() !== "") ?? "";

/**
 * The two texts whose line diff shows a canvas change. An addition or a
 * removal keeps one line of the canvas beside it, unchanged, so the diff
 * shows where it lands and never compares against an empty text.
 */
export function canvasDiff(
	view: Pick<SlackCanvasView, "change" | "before" | "content">,
	after: string,
): DiffTexts {
	const section = view.before ?? "";
	if (view.change === "replace") return { before: section, after };
	if (view.change === "insert_after")
		return { before: section, after: `${section}\n${after}` };
	if (view.change === "append") {
		const end = lastLine(view.content);
		return { before: end, after: end ? `${end}\n${after}` : after };
	}
	const at = view.content.indexOf(section);
	const above = at > 0 ? lastLine(view.content.slice(0, at)) : "";
	if (above) return { before: `${above}\n${section}`, after: above };
	const below =
		at < 0 ? "" : firstLine(view.content.slice(at + section.length));
	return below
		? { before: `${section}\n${below}`, after: below }
		: { before: section, after: "" };
}

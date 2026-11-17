import type { TextElement } from "@superset/chat/protocol";
import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { linkedContextData } from "renderer/routes/_authenticated/components/AgentComposer/utils/linkedContextChips";
import { linkOfChip } from "../linkChip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function elementKindOf(chip: ComposerChip): TextElement["elementKind"] {
	const kind = (chip.data as { elementKind?: unknown } | undefined)
		?.elementKind;
	return kind === "file_mention" || kind === "slash_command" ? kind : "other";
}

/** `before` is what the sent text part carries ahead of `text`. */
export function elementsForChips(
	text: string,
	chips: readonly ComposerChip[],
	before = "",
): TextElement[] {
	const elements: TextElement[] = [];
	const lead = encoder.encode(before).length;
	let cursor = 0;
	for (const chip of chips) {
		// A link chip is sent as its URL, so the message shows it as a link.
		if (linkOfChip(chip)) continue;
		const start = text.indexOf(chip.serialized, cursor);
		if (start === -1) continue;
		cursor = start + chip.serialized.length;
		const byteStart = lead + encoder.encode(text.slice(0, start)).length;
		elements.push({
			byteRange: {
				start: byteStart,
				end: byteStart + encoder.encode(chip.serialized).length,
			},
			elementKind: elementKindOf(chip),
			label: chip.label,
			...(linkedContextData(chip.data) ? { data: chip.data } : {}),
		});
	}
	return elements;
}

/** The elements of a text part, measured from after its first `before`. */
export function elementsAfter(
	elements: readonly TextElement[] | undefined,
	before: string,
): TextElement[] | undefined {
	if (!elements || !before) return elements ? [...elements] : undefined;
	const lead = encoder.encode(before).length;
	return elements.flatMap((element) =>
		element.byteRange.start < lead
			? []
			: [
					{
						...element,
						byteRange: {
							start: element.byteRange.start - lead,
							end: element.byteRange.end - lead,
						},
					},
				],
	);
}

export type MessageSegment =
	| { text: string; element?: undefined }
	| { text: string; element: TextElement };

export function splitByElements(
	text: string,
	elements: readonly TextElement[] | undefined,
): MessageSegment[] {
	if (!elements?.length) return [{ text }];
	const bytes = encoder.encode(text);
	const segments: MessageSegment[] = [];
	let cursor = 0;
	for (const element of [...elements].sort(
		(a, b) => a.byteRange.start - b.byteRange.start,
	)) {
		const { start, end } = element.byteRange;
		if (start < cursor || end > bytes.length || end <= start) continue;
		if (start > cursor)
			segments.push({ text: decoder.decode(bytes.slice(cursor, start)) });
		segments.push({ text: decoder.decode(bytes.slice(start, end)), element });
		cursor = end;
	}
	if (cursor < bytes.length)
		segments.push({ text: decoder.decode(bytes.slice(cursor)) });
	return segments;
}
